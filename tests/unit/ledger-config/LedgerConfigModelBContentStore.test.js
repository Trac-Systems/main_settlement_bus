import test from 'brittle';
import b4a from 'b4a';
import Corestore from 'corestore';
import fs from 'fs';
import Hyperbee from 'hyperbee';

import {
    LEDGER_CONFIG_CACHE_CONFLICT,
    LEDGER_CONFIG_CACHE_CORE_NAME,
    LedgerConfigContentStore,
} from '../../../src/core/ledger-config/LedgerConfigContentStore.js';
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

async function makePersistedConfig() {
    const snapshot = {
        formatVersion: LEDGER_CONFIG_FORMAT_VERSION,
        commitmentScheme: LEDGER_CONFIG_COMMITMENT_SCHEME,
        schemaId: 'test/model-b-store/v1',
        entries: [
            { key: b4a.from('alpha'), value: b4a.from('one') },
            { key: b4a.from('beta'), value: b4a.from('two') },
        ],
    };
    const previousCommitId = createZeroCommitId();
    const tree = await buildLedgerConfigTree(snapshot);
    const configId = await calculateConfigId(snapshot, tree.root);
    const descriptor = {
        formatVersion: snapshot.formatVersion,
        commitmentScheme: snapshot.commitmentScheme,
        schemaId: snapshot.schemaId,
        configVersion: 1,
        configRoot: tree.root,
        configId,
        commitId: await calculateCommitId(previousCommitId, configId),
        contentRef: await calculateContentRef(snapshot),
    };
    return { snapshot, previousCommitId, tree, descriptor };
}

test('Model B real content store is persistent, idempotent, corruption-safe and readiness-bound', async t => {
    const directory = `./.test-model-b-content-store-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    let corestore = new Corestore(directory);
    let contentStore = new LedgerConfigContentStore(corestore);
    const config = await makePersistedConfig();

    try {
        await contentStore.ready();
        const firstRef = await contentStore.putSnapshot(config.snapshot);
        const secondRef = await contentStore.putSnapshot(config.snapshot);
        t.ok(b4a.equals(firstRef, config.descriptor.contentRef));
        t.ok(b4a.equals(secondRef, firstRef), 'repeated snapshot writes are idempotent');

        await contentStore.putCandidate(config);
        await contentStore.putCandidate(config);
        const manifest = await contentStore.getManifest(config.descriptor.commitId);
        t.ok(b4a.equals(manifest.descriptor.commitId, config.descriptor.commitId));
        const node = await contentStore.getNode(config.tree.nodes[0].hash);
        t.ok(node, 'content-addressed Merkle nodes are readable after persistence');

        await contentStore.markReady({
            sourceSignedLength: 123,
            previousCommitId: config.previousCommitId,
            descriptor: config.descriptor,
        });
        const ready = await contentStore.getReady();
        t.is(ready.sourceSignedLength, 123);
        t.is(ready.verified, true);
        t.ok(b4a.equals(ready.descriptor.configRoot, config.tree.root));

        await contentStore.close();
        await corestore.close();
        corestore = new Corestore(directory);
        contentStore = new LedgerConfigContentStore(corestore);
        await contentStore.ready();

        const reopenedSnapshot = await contentStore.getSnapshot(config.descriptor.contentRef);
        t.is(b4a.toString(reopenedSnapshot.entries[0].key), 'alpha');
        t.is((await contentStore.getReady()).verified, true,
            'verified ready metadata survives a Corestore restart');

        const rawCore = corestore.get({ name: LEDGER_CONFIG_CACHE_CORE_NAME });
        const rawBee = new Hyperbee(rawCore, {
            extension: false,
            keyEncoding: 'ascii',
            valueEncoding: 'binary',
        });
        await rawBee.ready();
        const contentKey = `content/${b4a.toString(config.descriptor.contentRef, 'hex')}`;
        await rawBee.put(contentKey, b4a.from('corrupt'));

        await t.exception(
            () => contentStore.getSnapshot(config.descriptor.contentRef),
            /snapshot is corrupt/
        );
        t.is(await contentStore.getReady(), null,
            'corrupt content can never authorize persisted readiness');
        await contentStore.putCandidate(config);
        const repaired = await contentStore.getSnapshot(config.descriptor.contentRef);
        t.is(b4a.toString(repaired.entries[0].key), 'alpha');
        t.is((await contentStore.getReady()).verified, true,
            'a fully verified candidate can repair a corrupt derived entry');

        let conflict;
        try {
            await contentStore.putCandidate({
                ...config,
                descriptor: { ...config.descriptor, configVersion: 2 },
            });
        } catch (error) {
            conflict = error;
        }
        t.ok(/Immutable ledger config cache entry conflicts/.test(conflict?.message));
        t.is(conflict.code, LEDGER_CONFIG_CACHE_CONFLICT);

        await contentStore.clearReady();
        t.is(await contentStore.getReady(), null);
        await rawBee.close();
        await rawCore.close();
    } finally {
        await contentStore.close().catch(() => {});
        await corestore.close().catch(() => {});
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('Model B content store keeps separate manifests for recommits of the same root', async t => {
    const directory = `./.test-model-b-recommit-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const corestore = new Corestore(directory);
    const contentStore = new LedgerConfigContentStore(corestore);
    const first = await makePersistedConfig();
    const secondDescriptor = {
        ...first.descriptor,
        configVersion: 2,
        configRoot: b4a.from(first.descriptor.configRoot),
        configId: b4a.from(first.descriptor.configId),
        contentRef: b4a.from(first.descriptor.contentRef),
        commitId: await calculateCommitId(
            first.descriptor.commitId,
            first.descriptor.configId
        ),
    };

    try {
        await contentStore.ready();
        await contentStore.putCandidate(first);
        await contentStore.putCandidate({
            snapshot: first.snapshot,
            tree: first.tree,
            previousCommitId: first.descriptor.commitId,
            descriptor: secondDescriptor,
        });

        const firstManifest = await contentStore.getManifest(first.descriptor.commitId);
        const secondManifest = await contentStore.getManifest(secondDescriptor.commitId);
        t.is(firstManifest.descriptor.configVersion, 1);
        t.is(secondManifest.descriptor.configVersion, 2);
        t.ok(b4a.equals(firstManifest.descriptor.configRoot, secondManifest.descriptor.configRoot));
        t.not(
            b4a.toString(firstManifest.descriptor.commitId, 'hex'),
            b4a.toString(secondManifest.descriptor.commitId, 'hex')
        );

        await contentStore.markReady({
            sourceSignedLength: 456,
            previousCommitId: first.descriptor.commitId,
            descriptor: secondDescriptor,
        });
        const ready = await contentStore.getReady();
        t.is(ready.descriptor.configVersion, 2);
        t.ok(b4a.equals(ready.descriptor.commitId, secondDescriptor.commitId));
    } finally {
        await contentStore.close().catch(() => {});
        await corestore.close().catch(() => {});
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
