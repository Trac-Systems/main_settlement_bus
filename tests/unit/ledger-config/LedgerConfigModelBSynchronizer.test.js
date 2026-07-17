import test from 'brittle';
import b4a from 'b4a';

import { LedgerConfigAdapterRegistry } from '../../../src/core/ledger-config/adapters/LedgerConfigAdapterRegistry.js';
import {
    LEDGER_CONFIG_COMMITMENT_SCHEME,
    LEDGER_CONFIG_FORMAT_VERSION,
    createZeroCommitId,
} from '../../../src/core/ledger-config/index.js';
import {
    buildLedgerConfigTree,
    calculateCommitId,
    calculateConfigId,
    calculateContentRef,
} from '../../../src/core/ledger-config/ledgerConfigMerkle.js';
import { LedgerConfigSynchronizer } from '../../../src/core/ledger-config/LedgerConfigSynchronizer.js';
import {
    CONFIG_UNAVAILABLE,
    CONFIG_VERIFYING,
    CONSENSUS_READY,
    NOT_READY,
    UNSUPPORTED_CONSENSUS,
} from '../../../src/core/ledger-config/ledgerConfigStatus.js';

const TEST_SCHEMA_ID = 'test/model-b-consensus/v1';

function cloneSnapshot(snapshot) {
    return {
        ...snapshot,
        entries: snapshot.entries.map(entry => ({
            key: b4a.from(entry.key),
            value: b4a.from(entry.value),
        })),
    };
}

function cloneDescriptor(descriptor) {
    return {
        ...descriptor,
        configRoot: b4a.from(descriptor.configRoot),
        configId: b4a.from(descriptor.configId),
        commitId: b4a.from(descriptor.commitId),
        contentRef: b4a.from(descriptor.contentRef),
    };
}

function cloneSigned(signed) {
    if (!signed) return signed;
    return {
        sourceSignedLength: signed.sourceSignedLength,
        previousCommitId: b4a.from(signed.previousCommitId),
        descriptor: cloneDescriptor(signed.descriptor),
    };
}

async function makeConfig(value, {
    configVersion = 1,
    sourceSignedLength = 10,
    previousCommitId = createZeroCommitId(),
} = {}) {
    const snapshot = {
        formatVersion: LEDGER_CONFIG_FORMAT_VERSION,
        commitmentScheme: LEDGER_CONFIG_COMMITMENT_SCHEME,
        schemaId: TEST_SCHEMA_ID,
        entries: [{ key: b4a.from('parameter', 'utf8'), value: b4a.from([value]) }],
    };
    const tree = await buildLedgerConfigTree(snapshot);
    const configId = await calculateConfigId(snapshot, tree.root);
    const commitId = await calculateCommitId(previousCommitId, configId);
    const contentRef = await calculateContentRef(snapshot);
    const descriptor = {
        formatVersion: snapshot.formatVersion,
        commitmentScheme: snapshot.commitmentScheme,
        schemaId: snapshot.schemaId,
        configVersion,
        configRoot: tree.root,
        configId,
        commitId,
        contentRef,
    };
    return {
        snapshot,
        tree,
        signed: { sourceSignedLength, previousCommitId, descriptor },
    };
}

function createAdapterRegistry() {
    return new LedgerConfigAdapterRegistry([{
        schemaId: TEST_SCHEMA_ID,
        validate(snapshot) {
            if (snapshot.entries.length !== 1 || snapshot.entries[0].value.length !== 1) {
                throw new Error('Invalid test consensus snapshot.');
            }
            return Object.freeze({ parameter: snapshot.entries[0].value[0] });
        },
    }]);
}

class MutableDescriptorProvider {
    constructor(current) {
        this.current = current;
        this.reads = 0;
    }

    async getSignedLedgerConfig() {
        this.reads++;
        return cloneSigned(this.current);
    }
}

class FakeContentStore {
    snapshots = new Map();
    candidates = [];
    readyRecord = null;
    clearCount = 0;
    getSnapshotOverride = null;
    markReadyOverride = null;

    async ready() {}

    async getSnapshot(contentRef) {
        if (this.getSnapshotOverride) return await this.getSnapshotOverride(contentRef);
        const snapshot = this.snapshots.get(b4a.toString(contentRef, 'hex'));
        return snapshot ? cloneSnapshot(snapshot) : null;
    }

    async putCandidate(candidate) {
        this.candidates.push({
            ...candidate,
            descriptor: cloneDescriptor(candidate.descriptor),
            snapshot: cloneSnapshot(candidate.snapshot),
        });
        this.snapshots.set(
            b4a.toString(candidate.descriptor.contentRef, 'hex'),
            cloneSnapshot(candidate.snapshot)
        );
    }

    async markReady(record) {
        if (this.markReadyOverride) return await this.markReadyOverride(record);
        this.readyRecord = {
            ...record,
            previousCommitId: b4a.from(record.previousCommitId),
            descriptor: cloneDescriptor(record.descriptor),
            verified: true,
        };
        return this.readyRecord;
    }

    async clearReady() {
        this.clearCount++;
        this.readyRecord = null;
    }
}

function deferred() {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return { promise, resolve };
}

function makeSynchronizer(
    provider,
    store,
    sources = [],
    registry = createAdapterRegistry(),
    options = {}
) {
    return new LedgerConfigSynchronizer({
        descriptorProvider: provider,
        contentStore: store,
        adapterRegistry: registry,
        snapshotSources: sources,
        ...options,
    });
}

test('Model B synchronizer fails closed when active content is missing', async t => {
    const config = await makeConfig(1);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(new MutableDescriptorProvider(config.signed), store);

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, CONFIG_UNAVAILABLE);
    t.is(synchronizer.isConsensusReady, false);
    t.is(synchronizer.activeConfig, null);
    t.is(store.readyRecord, null);
});

test('Model B synchronizer rejects an available snapshot with a bad signed root', async t => {
    const config = await makeConfig(2);
    config.signed.descriptor.configRoot = b4a.alloc(32, 0xAB);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, CONFIG_VERIFYING);
    t.is(store.readyRecord, null);
    t.is(store.candidates.length, 0);
});

test('Model B synchronizer fails closed for an unsupported consensus adapter', async t => {
    const config = await makeConfig(3);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)],
        new LedgerConfigAdapterRegistry()
    );

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, UNSUPPORTED_CONSENSUS);
    t.is(synchronizer.isConsensusReady, false);
    t.is(store.candidates.length, 0, 'content is not fetched before adapter support is known');
});

test('Model B synchronizer verifies, persists and activates a supported snapshot', async t => {
    const config = await makeConfig(4);
    const store = new FakeContentStore();
    const provider = new MutableDescriptorProvider(config.signed);
    const statuses = [];
    const synchronizer = makeSynchronizer(
        provider,
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );
    synchronizer.on('status', status => statuses.push(status));

    const active = await synchronizer.synchronize();

    t.is(synchronizer.status, CONSENSUS_READY);
    t.is(synchronizer.isConsensusReady, true);
    t.is(active.decoded.parameter, 4);
    t.is(active.adapterValue.parameter, 4);
    t.is(active.adapterConfig.parameter, 4);
    t.ok(b4a.equals(active.tree.root, config.tree.root));
    t.ok(b4a.equals(active.snapshot.entries[0].value, b4a.from([4])));
    t.is(store.candidates.length, 1);
    t.is(store.readyRecord.verified, true);
    t.is(provider.reads, 2, 'activation is protected by a signed descriptor double-read');
    t.alike(statuses, ['SYNCING_LEDGER', CONFIG_VERIFYING, CONSENSUS_READY]);

    active.descriptor.configRoot.fill(0);
    t.ok(b4a.equals(synchronizer.activeConfig.descriptor.configRoot, config.tree.root),
        'callers cannot mutate the active descriptor');
});

test('Model B synchronizer never activates a stale cache entry', async t => {
    const stale = await makeConfig(5, { configVersion: 1 });
    const current = await makeConfig(6, {
        configVersion: 2,
        previousCommitId: stale.signed.descriptor.commitId,
    });
    const store = new FakeContentStore();
    store.getSnapshotOverride = async () => cloneSnapshot(stale.snapshot);
    const synchronizer = makeSynchronizer(new MutableDescriptorProvider(current.signed), store);

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, CONFIG_VERIFYING);
    t.is(synchronizer.isConsensusReady, false);
    t.is(store.readyRecord, null);
});

test('Model B synchronizer retries C to D races and marks only D ready', async t => {
    const configC = await makeConfig(7, { configVersion: 3, sourceSignedLength: 30 });
    const configD = await makeConfig(8, {
        configVersion: 4,
        sourceSignedLength: 40,
        previousCommitId: configC.signed.descriptor.commitId,
    });
    const provider = new MutableDescriptorProvider(configC.signed);
    const store = new FakeContentStore();
    const sourceStarted = deferred();
    const releaseC = deferred();
    const source = async descriptor => {
        if (b4a.equals(descriptor.contentRef, configC.signed.descriptor.contentRef)) {
            sourceStarted.resolve();
            await releaseC.promise;
            return cloneSnapshot(configC.snapshot);
        }
        return cloneSnapshot(configD.snapshot);
    };
    const synchronizer = makeSynchronizer(provider, store, [source]);

    const synchronization = synchronizer.synchronize();
    await sourceStarted.promise;
    provider.current = configD.signed;
    releaseC.resolve();
    const active = await synchronization;

    t.is(synchronizer.status, CONSENSUS_READY);
    t.is(active.decoded.parameter, 8);
    t.is(store.candidates.length, 2, 'C may remain as an immutable historical candidate');
    t.ok(b4a.equals(store.readyRecord.descriptor.commitId, configD.signed.descriptor.commitId));
    t.not(b4a.toString(store.readyRecord.descriptor.commitId, 'hex'),
        b4a.toString(configC.signed.descriptor.commitId, 'hex'));
});

test('Model B synchronizer exposes one promise for concurrent synchronize calls', async t => {
    const config = await makeConfig(9);
    const provider = new MutableDescriptorProvider(config.signed);
    const store = new FakeContentStore();
    const sourceStarted = deferred();
    const release = deferred();
    let fetches = 0;
    const synchronizer = makeSynchronizer(provider, store, [async () => {
        fetches++;
        sourceStarted.resolve();
        await release.promise;
        return cloneSnapshot(config.snapshot);
    }]);

    const first = synchronizer.synchronize();
    await sourceStarted.promise;
    const second = synchronizer.synchronize();
    t.is(first, second);
    release.resolve();
    const [left, right] = await Promise.all([first, second]);

    t.is(fetches, 1);
    t.is(store.candidates.length, 1);
    t.is(left.decoded.parameter, 9);
    t.is(right.decoded.parameter, 9);
});

test('Model B fresh consensus guard ignores signed length growth but invalidates a changed descriptor', async t => {
    const configC = await makeConfig(10, { configVersion: 5, sourceSignedLength: 50 });
    const configD = await makeConfig(11, {
        configVersion: 6,
        sourceSignedLength: 70,
        previousCommitId: configC.signed.descriptor.commitId,
    });
    const provider = new MutableDescriptorProvider(configC.signed);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        provider,
        store,
        [async () => cloneSnapshot(configC.snapshot)]
    );
    await synchronizer.synchronize();

    provider.current = { ...configC.signed, sourceSignedLength: 60 };
    const stillReady = await synchronizer.requireConsensusReady();
    t.is(stillReady.decoded.parameter, 10);
    t.is(synchronizer.status, CONSENSUS_READY);

    provider.current = configD.signed;
    await t.exception(
        () => synchronizer.requireConsensusReady(),
        /changed after synchronization/
    );
    t.is(synchronizer.status, NOT_READY);
    t.is(synchronizer.isConsensusReady, false);
    t.is(synchronizer.activeConfig, null);
    t.is(store.readyRecord, null);
});

test('Model B synchronizer treats snapshot transport errors as unavailable content', async t => {
    const config = await makeConfig(12);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => {
            throw new Error('peer disconnected');
        }]
    );

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, CONFIG_UNAVAILABLE);
    t.ok(/peer disconnected/.test(synchronizer.lastError.message));
    t.is(store.readyRecord, null);
});

test('Model B synchronize remains single-flight under a reentrant status listener', async t => {
    const config = await makeConfig(13);
    const store = new FakeContentStore();
    const provider = new MutableDescriptorProvider(config.signed);
    const synchronizer = makeSynchronizer(
        provider,
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );
    let reentrant = null;
    synchronizer.on('status', status => {
        if (status === 'SYNCING_LEDGER') reentrant = synchronizer.synchronize();
    });

    const first = synchronizer.synchronize();
    const active = await first;

    t.is(reentrant, first);
    t.is(active.adapterConfig.parameter, 13);
    t.is(provider.reads, 2);
    t.is(store.candidates.length, 1);
});

test('Model B unchanged signed config takes the ready fast path without clearing or fetching', async t => {
    const config = await makeConfig(14, { sourceSignedLength: 100 });
    const store = new FakeContentStore();
    const provider = new MutableDescriptorProvider(config.signed);
    let fetches = 0;
    const statuses = [];
    const synchronizer = makeSynchronizer(provider, store, [async () => {
        fetches++;
        return cloneSnapshot(config.snapshot);
    }]);
    synchronizer.on('status', status => statuses.push(status));
    await synchronizer.synchronize();
    const clearCount = store.clearCount;
    const candidateCount = store.candidates.length;
    const statusCount = statuses.length;

    provider.current = { ...config.signed, sourceSignedLength: 101 };
    const active = await synchronizer.synchronize();

    t.is(active.adapterConfig.parameter, 14);
    t.is(synchronizer.status, CONSENSUS_READY);
    t.is(fetches, 1);
    t.is(store.clearCount, clearCount);
    t.is(store.candidates.length, candidateCount);
    t.is(statuses.length, statusCount);
});

test('Model B close waits out an in-flight ready write and leaves no ready marker', async t => {
    const config = await makeConfig(15);
    const store = new FakeContentStore();
    const markStarted = deferred();
    const releaseMark = deferred();
    store.markReadyOverride = async record => {
        markStarted.resolve();
        await releaseMark.promise;
        store.readyRecord = { ...record, verified: true };
    };
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );

    const synchronization = synchronizer.synchronize();
    await markStarted.promise;
    const closing = synchronizer.close();
    releaseMark.resolve();
    await Promise.all([synchronization, closing]);

    t.is(synchronizer.status, 'CLOSED');
    t.is(synchronizer.isConsensusReady, false);
    t.is(store.readyRecord, null);
});

test('Model B active adapter config is defensively cloned at nested boundaries', async t => {
    const config = await makeConfig(16);
    const store = new FakeContentStore();
    const registry = new LedgerConfigAdapterRegistry([{
        schemaId: TEST_SCHEMA_ID,
        validate() {
            return {
                validators: [{ weight: 7, publicKey: b4a.alloc(32, 0xAA) }],
            };
        },
    }]);
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)],
        registry
    );
    const exposed = await synchronizer.synchronize();
    t.ok(Object.isFrozen(exposed.adapterConfig));
    t.is(Object.getPrototypeOf(exposed.adapterConfig), null);
    t.ok(Object.isFrozen(exposed.adapterConfig.validators));
    t.ok(Object.isFrozen(exposed.adapterConfig.validators[0]));
    await t.exception.all(() => {
        exposed.adapterConfig.validators[0].weight = 999;
    }, /read only/);
    exposed.adapterConfig.validators[0].publicKey.fill(0);

    const fresh = synchronizer.activeConfig.adapterConfig;
    t.is(fresh.validators[0].weight, 7);
    t.is(fresh.validators[0].publicKey[0], 0xAA);
});

test('Model B synchronizer rejects a zero configVersion as malformed signed metadata', async t => {
    const config = await makeConfig(17);
    config.signed.descriptor.configVersion = 0;
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, CONFIG_VERIFYING);
    t.is(store.candidates.length, 0);
    t.is(store.readyRecord, null);
});

test('Model B synchronizer skips a timed-out snapshot source and verifies the next one', async t => {
    const config = await makeConfig(18);
    const store = new FakeContentStore();
    let fetches = 0;
    const never = new Promise(() => {});
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [
            async () => {
                fetches++;
                return await never;
            },
            async () => {
                fetches++;
                return cloneSnapshot(config.snapshot);
            },
        ],
        createAdapterRegistry(),
        { snapshotSourceTimeoutMs: 5 }
    );

    const active = await synchronizer.synchronize();
    t.is(active.adapterConfig.parameter, 18);
    t.is(fetches, 2);
    t.is(synchronizer.status, CONSENSUS_READY);
});

test('Model B close cancels a hung snapshot source and synchronization flight', async t => {
    const config = await makeConfig(19);
    const store = new FakeContentStore();
    const sourceStarted = deferred();
    const never = new Promise(() => {});
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => {
            sourceStarted.resolve();
            return await never;
        }]
    );

    const flight = synchronizer.synchronize();
    await sourceStarted.promise;
    await synchronizer.close();

    t.is(await flight, null);
    t.is(synchronizer.status, 'CLOSED');
    t.is(store.readyRecord, null);
});

test('Model B close cancels a hung adapter validation and synchronization flight', async t => {
    const config = await makeConfig(22);
    const store = new FakeContentStore();
    const validationStarted = deferred();
    const never = new Promise(() => {});
    const registry = new LedgerConfigAdapterRegistry([{
        schemaId: TEST_SCHEMA_ID,
        async validate() {
            validationStarted.resolve();
            return await never;
        },
    }]);
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)],
        registry
    );

    const flight = synchronizer.synchronize();
    await validationStarted.promise;
    await synchronizer.close();

    t.is(await flight, null);
    t.is(synchronizer.status, 'CLOSED');
    t.is(store.candidates.length, 0);
    t.is(store.readyRecord, null);
});

test('Model B status listener errors cannot reject a verified synchronization', async t => {
    const config = await makeConfig(20);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );
    synchronizer.on('status', () => {
        throw new Error('observer failure');
    });

    const active = await synchronizer.synchronize();
    t.is(active.adapterConfig.parameter, 20);
    t.is(synchronizer.status, CONSENSUS_READY);
    t.is(store.readyRecord.verified, true);
});

test('Model B reentrant close on READY never returns an active config', async t => {
    const config = await makeConfig(27);
    const store = new FakeContentStore();
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)]
    );
    let closing = null;
    synchronizer.on('status', status => {
        if (status === CONSENSUS_READY) closing = synchronizer.close();
    });

    t.is(await synchronizer.synchronize(), null);
    await closing;
    t.is(synchronizer.status, 'CLOSED');
    t.is(synchronizer.isConsensusReady, false);
    t.is(store.readyRecord, null);
});

test('Model B synchronizer rejects non-plain adapter output before persistence', async t => {
    const config = await makeConfig(21);
    const store = new FakeContentStore();
    const registry = new LedgerConfigAdapterRegistry([{
        schemaId: TEST_SCHEMA_ID,
        validate() {
            return { unsafe: () => true };
        },
    }]);
    const synchronizer = makeSynchronizer(
        new MutableDescriptorProvider(config.signed),
        store,
        [async () => cloneSnapshot(config.snapshot)],
        registry
    );

    t.is(await synchronizer.synchronize(), null);
    t.is(synchronizer.status, CONFIG_VERIFYING);
    t.is(store.candidates.length, 0);
    t.is(store.readyRecord, null);
});

test('Model B adapter normalization never invokes array hooks or accessors', async t => {
    const cases = [
        {
            name: 'own map hook',
            makeArray(markInvoked) {
                const values = [1];
                Object.defineProperty(values, 'map', {
                    enumerable: true,
                    value() {
                        markInvoked();
                        return [];
                    },
                });
                return values;
            },
        },
        {
            name: 'numeric getter',
            makeArray(markInvoked) {
                const values = [];
                Object.defineProperty(values, 0, {
                    enumerable: true,
                    get() {
                        markInvoked();
                        return 1;
                    },
                });
                return values;
            },
        },
    ];

    for (const [index, scenario] of cases.entries()) {
        const config = await makeConfig(28 + index);
        const store = new FakeContentStore();
        let invoked = false;
        const registry = new LedgerConfigAdapterRegistry([{
            schemaId: TEST_SCHEMA_ID,
            validate() {
                return {
                    values: scenario.makeArray(() => {
                        invoked = true;
                    }),
                };
            },
        }]);
        const synchronizer = makeSynchronizer(
            new MutableDescriptorProvider(config.signed),
            store,
            [async () => cloneSnapshot(config.snapshot)],
            registry
        );

        t.is(await synchronizer.synchronize(), null, `${scenario.name} is rejected`);
        t.is(invoked, false, `${scenario.name} is not invoked`);
        t.is(synchronizer.isConsensusReady, false, `${scenario.name} cannot activate consensus`);
        t.is(store.candidates.length, 0, `${scenario.name} is rejected before persistence`);
        t.is(store.readyRecord, null, `${scenario.name} cannot leave durable READY`);
        await synchronizer.close();
    }
});

test('Model B synchronizer rejects prototype-pollution keys before durable readiness', async t => {
    const originalPolluted = Object.prototype.polluted;

    for (const [index, reservedKey] of ['__proto__', 'constructor', 'prototype'].entries()) {
        const config = await makeConfig(23 + index);
        const store = new FakeContentStore();
        const registry = new LedgerConfigAdapterRegistry([{
            schemaId: TEST_SCHEMA_ID,
            validate() {
                const decoded = { parameter: 23 + index };
                Object.defineProperty(decoded, reservedKey, {
                    configurable: true,
                    enumerable: true,
                    value: { polluted: true },
                    writable: true,
                });
                return decoded;
            },
        }]);
        const synchronizer = makeSynchronizer(
            new MutableDescriptorProvider(config.signed),
            store,
            [async () => cloneSnapshot(config.snapshot)],
            registry
        );

        t.is(await synchronizer.synchronize(), null, `${reservedKey} is rejected`);
        t.is(synchronizer.status, CONFIG_VERIFYING, `${reservedKey} fails verification`);
        t.is(synchronizer.isConsensusReady, false, `${reservedKey} cannot activate consensus`);
        t.is(store.candidates.length, 0, `${reservedKey} is rejected before persistence`);
        t.is(store.readyRecord, null, `${reservedKey} cannot leave durable READY`);
        t.is(Object.prototype.polluted, originalPolluted, `${reservedKey} cannot pollute prototypes`);
        await synchronizer.close();
    }
});
