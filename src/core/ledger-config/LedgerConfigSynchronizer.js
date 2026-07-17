import EventEmitter from 'bare-events';
import b4a from 'b4a';

import { encodeLedgerConfigRootRecord } from '../../codecs/apply/ledgerConfigCodec.js';
import { LEDGER_CONFIG_HASH_BYTES } from './ledgerConfigConstants.js';
import {
    buildLedgerConfigTree,
    calculateCommitId,
    calculateConfigId,
    calculateContentRef,
    canonicalizeSnapshot,
} from './ledgerConfigMerkle.js';
import {
    CLOSED,
    CONFIG_UNAVAILABLE,
    CONFIG_VERIFYING,
    CONSENSUS_READY,
    NOT_READY,
    SYNCING_LEDGER,
    UNSUPPORTED_CONSENSUS,
} from './ledgerConfigStatus.js';

export const LEDGER_CONFIG_NOT_READY = 'LEDGER_CONFIG_NOT_READY';
export const LEDGER_CONFIG_SYNCHRONIZER_CLOSED = 'LEDGER_CONFIG_SYNCHRONIZER_CLOSED';
export const LEDGER_CONFIG_CHANGED_DURING_SYNC = 'LEDGER_CONFIG_CHANGED_DURING_SYNC';
export const LEDGER_CONFIG_SNAPSHOT_SOURCE_TIMEOUT = 'LEDGER_CONFIG_SNAPSHOT_SOURCE_TIMEOUT';

const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_SNAPSHOT_SOURCE_TIMEOUT_MS = 30_000;
const MAX_SNAPSHOT_SOURCE_TIMEOUT_MS = 0x7FFFFFFF;
const FORBIDDEN_ADAPTER_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class LedgerConfigNotReadyError extends Error {
    constructor(message = 'Ledger config is not consensus-ready.') {
        super(message);
        this.name = this.constructor.name;
        this.code = LEDGER_CONFIG_NOT_READY;
    }
}

export class LedgerConfigSynchronizerClosedError extends Error {
    constructor() {
        super('LedgerConfigSynchronizer is closed.');
        this.name = this.constructor.name;
        this.code = LEDGER_CONFIG_SYNCHRONIZER_CLOSED;
    }
}

export class LedgerConfigChangedDuringSyncError extends Error {
    constructor(attempts) {
        super(`Signed ledger config kept changing during ${attempts} synchronization attempts.`);
        this.name = this.constructor.name;
        this.code = LEDGER_CONFIG_CHANGED_DURING_SYNC;
        this.attempts = attempts;
    }
}

export class LedgerConfigSnapshotSourceTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Ledger config snapshot source timed out after ${timeoutMs}ms.`);
        this.name = this.constructor.name;
        this.code = LEDGER_CONFIG_SNAPSHOT_SOURCE_TIMEOUT;
        this.timeoutMs = timeoutMs;
    }
}

function assertObject(value, name) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${name} must be an object.`);
    }
}

function assertHash(value, name) {
    if (!b4a.isBuffer(value)) {
        throw new TypeError(`${name} must be a Buffer.`);
    }
    if (value.length !== LEDGER_CONFIG_HASH_BYTES) {
        throw new RangeError(`${name} must be ${LEDGER_CONFIG_HASH_BYTES} bytes.`);
    }
}

function assertUint32(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
    }
}

function assertDescriptor(descriptor, name) {
    assertObject(descriptor, name);
    assertUint32(descriptor.formatVersion, `${name}.formatVersion`);
    if (typeof descriptor.commitmentScheme !== 'string' || descriptor.commitmentScheme.length === 0) {
        throw new TypeError(`${name}.commitmentScheme must be a non-empty string.`);
    }
    if (typeof descriptor.schemaId !== 'string' || descriptor.schemaId.length === 0) {
        throw new TypeError(`${name}.schemaId must be a non-empty string.`);
    }
    if (!Number.isSafeInteger(descriptor.configVersion) || descriptor.configVersion <= 0) {
        throw new RangeError(`${name}.configVersion must be a positive safe integer.`);
    }
    assertHash(descriptor.configRoot, `${name}.configRoot`);
    assertHash(descriptor.configId, `${name}.configId`);
    assertHash(descriptor.commitId, `${name}.commitId`);
    assertHash(descriptor.contentRef, `${name}.contentRef`);
}

function cloneDescriptor(descriptor) {
    return {
        formatVersion: descriptor.formatVersion,
        commitmentScheme: descriptor.commitmentScheme,
        schemaId: descriptor.schemaId,
        configVersion: descriptor.configVersion,
        configRoot: b4a.from(descriptor.configRoot),
        configId: b4a.from(descriptor.configId),
        commitId: b4a.from(descriptor.commitId),
        contentRef: b4a.from(descriptor.contentRef),
    };
}

function cloneSnapshot(snapshot) {
    return {
        formatVersion: snapshot.formatVersion,
        commitmentScheme: snapshot.commitmentScheme,
        schemaId: snapshot.schemaId,
        entries: snapshot.entries.map(entry => ({
            key: b4a.from(entry.key),
            value: b4a.from(entry.value),
        })),
    };
}

function cloneNode(node) {
    if (node.type === 'empty') {
        return { type: node.type, hash: b4a.from(node.hash) };
    }
    if (node.type === 'leaf') {
        return {
            type: node.type,
            hash: b4a.from(node.hash),
            key: b4a.from(node.key),
            value: b4a.from(node.value),
        };
    }
    return {
        type: node.type,
        hash: b4a.from(node.hash),
        leftHash: b4a.from(node.leftHash),
        rightHash: b4a.from(node.rightHash),
    };
}

function cloneProof(proof) {
    if (!proof) return null;
    return {
        formatVersion: proof.formatVersion,
        commitmentScheme: proof.commitmentScheme,
        leafIndex: proof.leafIndex,
        leafCount: proof.leafCount,
        siblings: proof.siblings.map(sibling => ({
            position: sibling.position,
            size: sibling.size,
            hash: b4a.from(sibling.hash),
        })),
    };
}

function normalizeAdapterConfig(value, ancestors = new Set()) {
    if (value === null || value === undefined || typeof value === 'string' ||
        typeof value === 'boolean' || typeof value === 'bigint') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError('Adapter config numbers must be finite.');
        return value;
    }
    if (typeof value !== 'object') {
        throw new TypeError('Adapter config must contain only plain data values.');
    }
    if (b4a.isBuffer(value)) return b4a.from(value);
    if (ancestors.has(value)) throw new TypeError('Adapter config must not contain cycles.');
    ancestors.add(value);

    if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
            throw new TypeError('Adapter config arrays must use Array.prototype.');
        }
        if (Object.getOwnPropertySymbols(value).length > 0) {
            throw new TypeError('Adapter config arrays must not contain symbol properties.');
        }

        const descriptors = Object.getOwnPropertyDescriptors(value);
        const elementKeys = Object.keys(descriptors).filter(key => key !== 'length');
        if (elementKeys.length !== value.length) {
            throw new TypeError('Adapter config arrays must be dense and contain only indexed elements.');
        }

        const clone = new Array(value.length);
        for (let index = 0; index < value.length; index++) {
            const descriptor = descriptors[String(index)];
            if (!descriptor || !descriptor.enumerable ||
                !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                throw new TypeError('Adapter config arrays must contain only enumerable data elements.');
            }
            Object.defineProperty(clone, index, {
                configurable: false,
                enumerable: true,
                value: normalizeAdapterConfig(descriptor.value, ancestors),
                writable: false,
            });
        }
        ancestors.delete(value);
        return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Adapter config objects must be plain objects.');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError('Adapter config must not contain symbol properties.');
    }

    const clone = Object.create(null);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable) continue;
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new TypeError('Adapter config must not contain accessor properties.');
        }
        if (FORBIDDEN_ADAPTER_CONFIG_KEYS.has(key)) {
            throw new TypeError(`Adapter config must not contain the reserved key "${key}".`);
        }
        Object.defineProperty(clone, key, {
            configurable: false,
            enumerable: true,
            value: normalizeAdapterConfig(descriptor.value, ancestors),
            writable: false,
        });
    }
    ancestors.delete(value);
    return Object.freeze(clone);
}

function cloneTree(tree) {
    return {
        root: b4a.from(tree.root),
        entries: tree.entries.map(entry => ({
            index: entry.index,
            key: b4a.from(entry.key),
            value: b4a.from(entry.value),
            leafHash: b4a.from(entry.leafHash),
        })),
        nodes: tree.nodes.map(cloneNode),
        getProof(key) {
            return cloneProof(tree.getProof(key));
        },
    };
}

function cloneActiveConfig(active) {
    if (!active) return null;
    const adapterConfig = normalizeAdapterConfig(active.decoded);
    return {
        sourceSignedLength: active.sourceSignedLength,
        previousCommitId: b4a.from(active.previousCommitId),
        descriptor: cloneDescriptor(active.descriptor),
        snapshot: cloneSnapshot(active.snapshot),
        tree: cloneTree(active.tree),
        decoded: adapterConfig,
        adapterValue: adapterConfig,
        adapterConfig,
    };
}

function normalizeSignedConfig(signed) {
    if (signed === null || signed === undefined) return null;
    assertObject(signed, 'signed ledger config');
    if (!Number.isSafeInteger(signed.sourceSignedLength) || signed.sourceSignedLength < 0) {
        throw new RangeError('signed ledger config sourceSignedLength must be a non-negative safe integer.');
    }
    assertHash(signed.previousCommitId, 'signed ledger config previousCommitId');
    assertDescriptor(signed.descriptor, 'signed ledger config descriptor');

    const descriptor = cloneDescriptor(signed.descriptor);
    // The generated codec validates all scalar descriptor fields as one unit.
    encodeLedgerConfigRootRecord({
        previousCommitId: signed.previousCommitId,
        descriptor,
    });

    return {
        sourceSignedLength: signed.sourceSignedLength,
        previousCommitId: b4a.from(signed.previousCommitId),
        descriptor,
    };
}

function sameSignedConfig(left, right) {
    if (!left || !right) return false;
    try {
        return b4a.equals(
            encodeLedgerConfigRootRecord({
                previousCommitId: left.previousCommitId,
                descriptor: left.descriptor,
            }),
            encodeLedgerConfigRootRecord({
                previousCommitId: right.previousCommitId,
                descriptor: right.descriptor,
            })
        );
    } catch {
        return false;
    }
}

function assertDependencies({ descriptorProvider, contentStore, adapterRegistry }) {
    if (!descriptorProvider || typeof descriptorProvider.getSignedLedgerConfig !== 'function') {
        throw new TypeError('descriptorProvider.getSignedLedgerConfig must be a function.');
    }
    for (const method of ['getSnapshot', 'putCandidate', 'markReady', 'clearReady']) {
        if (!contentStore || typeof contentStore[method] !== 'function') {
            throw new TypeError(`contentStore.${method} must be a function.`);
        }
    }
    if (!adapterRegistry || typeof adapterRegistry.require !== 'function') {
        throw new TypeError('adapterRegistry.require must be a function.');
    }
}

function normalizeSources(snapshotSources) {
    if (!snapshotSources || typeof snapshotSources[Symbol.iterator] !== 'function') {
        throw new TypeError('snapshotSources must be iterable.');
    }
    const sources = Array.from(snapshotSources);
    for (const source of sources) {
        if (typeof source !== 'function' &&
            (!source || typeof source.getSnapshot !== 'function')) {
            throw new TypeError('Each snapshot source must be a function or expose getSnapshot().');
        }
    }
    return sources;
}

export class LedgerConfigSynchronizer extends EventEmitter {
    #descriptorProvider;
    #contentStore;
    #adapterRegistry;
    #snapshotSources;
    #maxAttempts;
    #snapshotSourceTimeoutMs;
    #status = NOT_READY;
    #activeConfig = null;
    #lastError = null;
    #synchronizePromise = null;
    #readyMutationPromise = null;
    #closePromise = null;
    #closeWaiters = new Set();
    #closed = false;

    constructor({
        descriptorProvider,
        contentStore,
        adapterRegistry,
        snapshotSources = [],
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        snapshotSourceTimeoutMs = DEFAULT_SNAPSHOT_SOURCE_TIMEOUT_MS,
    } = {}) {
        super();
        assertDependencies({ descriptorProvider, contentStore, adapterRegistry });
        if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
            throw new RangeError('maxAttempts must be a positive safe integer.');
        }
        if (!Number.isSafeInteger(snapshotSourceTimeoutMs) || snapshotSourceTimeoutMs < 1 ||
            snapshotSourceTimeoutMs > MAX_SNAPSHOT_SOURCE_TIMEOUT_MS) {
            throw new RangeError(
                `snapshotSourceTimeoutMs must be an integer between 1 and ${MAX_SNAPSHOT_SOURCE_TIMEOUT_MS}.`
            );
        }
        this.#descriptorProvider = descriptorProvider;
        this.#contentStore = contentStore;
        this.#adapterRegistry = adapterRegistry;
        this.#snapshotSources = normalizeSources(snapshotSources);
        this.#maxAttempts = maxAttempts;
        this.#snapshotSourceTimeoutMs = snapshotSourceTimeoutMs;
    }

    get status() {
        return this.#status;
    }

    get isConsensusReady() {
        return !this.#closed && this.#status === CONSENSUS_READY && this.#activeConfig !== null;
    }

    get activeConfig() {
        return cloneActiveConfig(this.#activeConfig);
    }

    get lastError() {
        return this.#lastError;
    }

    synchronize() {
        if (this.#closed) return Promise.reject(new LedgerConfigSynchronizerClosedError());
        if (this.#synchronizePromise) return this.#synchronizePromise;

        const flight = Promise.resolve().then(() => this.#runSynchronization());
        this.#synchronizePromise = flight;
        flight.then(() => {
            if (this.#synchronizePromise === flight) this.#synchronizePromise = null;
        }, () => {
            if (this.#synchronizePromise === flight) this.#synchronizePromise = null;
        });
        return flight;
    }

    async requireConsensusReady() {
        if (this.#closed) throw new LedgerConfigSynchronizerClosedError();
        if (!this.isConsensusReady) throw new LedgerConfigNotReadyError();

        const active = this.#activeConfig;
        let fresh;
        try {
            fresh = normalizeSignedConfig(
                await this.#cancelOnClose(
                    () => this.#descriptorProvider.getSignedLedgerConfig()
                )
            );
        } catch (error) {
            if (error instanceof LedgerConfigSynchronizerClosedError) throw error;
            await this.#invalidate(CONFIG_UNAVAILABLE, error);
            throw new LedgerConfigNotReadyError('Cannot freshly read the signed ledger config.');
        }

        if (this.#closed) throw new LedgerConfigSynchronizerClosedError();
        if (this.#activeConfig !== active || this.#status !== CONSENSUS_READY) {
            throw new LedgerConfigNotReadyError('Ledger config readiness changed during the fresh guard.');
        }

        if (!fresh || !sameSignedConfig(active, fresh)) {
            const status = fresh ? NOT_READY : CONFIG_UNAVAILABLE;
            await this.#invalidate(status, new LedgerConfigNotReadyError(
                'The signed ledger config changed after synchronization.'
            ));
            throw new LedgerConfigNotReadyError(
                'The signed ledger config changed after synchronization.'
            );
        }

        return this.activeConfig;
    }

    async close() {
        if (this.#closePromise) return await this.#closePromise;
        if (this.#closed) return;
        this.#closed = true;
        const closedError = new LedgerConfigSynchronizerClosedError();
        for (const reject of this.#closeWaiters) reject(closedError);
        this.#closeWaiters.clear();
        this.#activeConfig = null;
        this.#lastError = null;
        this.#setStatus(CLOSED);
        const readyMutation = this.#readyMutationPromise;
        const synchronization = this.#synchronizePromise;
        this.#closePromise = (async () => {
            try {
                await this.#contentStore.clearReady();
            } catch {
                // CLOSED is fail-closed even if the derived cache cannot be updated.
            }
            if (readyMutation) {
                try {
                    await readyMutation;
                } catch {
                    // The final clear below wins over a failed activation write.
                }
            }
            if (synchronization) {
                try {
                    await synchronization;
                } catch {
                    // Shutdown remains fail-closed after a synchronization error.
                }
            }
            try {
                await this.#contentStore.clearReady();
            } catch {
                // CLOSED remains fail-closed in memory.
            }
        })();
        await this.#closePromise;
    }

    async #runSynchronization() {
        let signed = null;

        if (this.#activeConfig && this.#status === CONSENSUS_READY) {
            try {
                const fresh = normalizeSignedConfig(
                    await this.#cancelOnClose(
                        () => this.#descriptorProvider.getSignedLedgerConfig()
                    )
                );
                if (this.#closed) return null;
                if (fresh && sameSignedConfig(this.#activeConfig, fresh)) {
                    this.#lastError = null;
                    return this.activeConfig;
                }
                signed = fresh;
            } catch (error) {
                if (error instanceof LedgerConfigSynchronizerClosedError) return null;
                return await this.#fail(SYNCING_LEDGER, error);
            }
        }

        this.#activeConfig = null;
        this.#lastError = null;
        this.#setStatus(SYNCING_LEDGER);

        try {
            if (typeof this.#contentStore.ready === 'function') {
                await this.#cancelOnClose(() => this.#contentStore.ready());
            }
            await this.#cancelOnClose(() => this.#contentStore.clearReady());
        } catch (error) {
            if (error instanceof LedgerConfigSynchronizerClosedError) return null;
            return await this.#fail(CONFIG_UNAVAILABLE, error);
        }
        if (this.#closed) return null;

        if (!signed) signed = await this.#readInitialSignedConfig();
        if (!signed) return null;

        for (let attempt = 1; attempt <= this.#maxAttempts; attempt++) {
            if (this.#closed) return null;

            let adapter;
            try {
                adapter = this.#adapterRegistry.require(signed.descriptor.schemaId);
            } catch (error) {
                return await this.#fail(UNSUPPORTED_CONSENSUS, error);
            }

            const verified = await this.#findVerifiedSnapshot(signed, adapter);
            if (!verified) return null;
            if (this.#closed) return null;

            try {
                await this.#cancelOnClose(() => this.#contentStore.putCandidate({
                    snapshot: verified.snapshot,
                    tree: verified.tree,
                    descriptor: signed.descriptor,
                    previousCommitId: signed.previousCommitId,
                }));
            } catch (error) {
                if (error instanceof LedgerConfigSynchronizerClosedError) return null;
                return await this.#fail(CONFIG_UNAVAILABLE, error);
            }
            if (this.#closed) return null;

            const reread = await this.#readSignedConfigForVerification();
            if (!reread) return null;
            if (this.#closed) return null;
            if (!sameSignedConfig(signed, reread)) {
                signed = reread;
                this.#setStatus(SYNCING_LEDGER);
                continue;
            }

            let preparedActiveConfig;
            let exposedActiveConfig;
            try {
                preparedActiveConfig = {
                    sourceSignedLength: reread.sourceSignedLength,
                    previousCommitId: b4a.from(reread.previousCommitId),
                    descriptor: cloneDescriptor(reread.descriptor),
                    snapshot: cloneSnapshot(verified.snapshot),
                    tree: verified.tree,
                    decoded: normalizeAdapterConfig(verified.decoded),
                };
                exposedActiveConfig = cloneActiveConfig(preparedActiveConfig);
            } catch (error) {
                return await this.#fail(CONFIG_VERIFYING, error);
            }

            try {
                const marking = Promise.resolve().then(() => this.#contentStore.markReady({
                    sourceSignedLength: reread.sourceSignedLength,
                    previousCommitId: reread.previousCommitId,
                    descriptor: reread.descriptor,
                }));
                this.#readyMutationPromise = marking;
                try {
                    await marking;
                } finally {
                    if (this.#readyMutationPromise === marking) {
                        this.#readyMutationPromise = null;
                    }
                }
            } catch (error) {
                return await this.#fail(CONFIG_UNAVAILABLE, error);
            }
            if (this.#closed) {
                try {
                    await this.#contentStore.clearReady();
                } catch {
                    // The synchronizer remains closed and therefore fail-closed.
                }
                return null;
            }

            this.#activeConfig = preparedActiveConfig;
            this.#lastError = null;
            this.#setStatus(CONSENSUS_READY);
            return this.#closed ? null : exposedActiveConfig;
        }

        return await this.#fail(
            SYNCING_LEDGER,
            new LedgerConfigChangedDuringSyncError(this.#maxAttempts)
        );
    }

    async #readInitialSignedConfig() {
        let raw;
        try {
            raw = await this.#cancelOnClose(
                () => this.#descriptorProvider.getSignedLedgerConfig()
            );
        } catch (error) {
            if (error instanceof LedgerConfigSynchronizerClosedError) return null;
            await this.#fail(SYNCING_LEDGER, error);
            return null;
        }
        if (raw === null || raw === undefined) {
            await this.#fail(
                CONFIG_UNAVAILABLE,
                new LedgerConfigNotReadyError('Signed ledger config is unavailable.')
            );
            return null;
        }
        try {
            return normalizeSignedConfig(raw);
        } catch (error) {
            await this.#fail(CONFIG_VERIFYING, error);
            return null;
        }
    }

    async #readSignedConfigForVerification() {
        let raw;
        try {
            raw = await this.#cancelOnClose(
                () => this.#descriptorProvider.getSignedLedgerConfig()
            );
        } catch (error) {
            if (error instanceof LedgerConfigSynchronizerClosedError) return null;
            await this.#fail(SYNCING_LEDGER, error);
            return null;
        }
        if (raw === null || raw === undefined) {
            await this.#fail(
                CONFIG_UNAVAILABLE,
                new LedgerConfigNotReadyError('Signed ledger config disappeared during verification.')
            );
            return null;
        }
        try {
            return normalizeSignedConfig(raw);
        } catch (error) {
            await this.#fail(CONFIG_VERIFYING, error);
            return null;
        }
    }

    async #findVerifiedSnapshot(signed, adapter) {
        let sawInvalid = false;
        let sawFetchError = false;
        let lastError = null;

        try {
            const local = await this.#cancelOnClose(
                () => this.#contentStore.getSnapshot(signed.descriptor.contentRef)
            );
            if (local !== null && local !== undefined) {
                this.#setStatus(CONFIG_VERIFYING);
                try {
                    return await this.#cancelOnClose(
                        () => this.#verifySnapshot(signed, adapter, local)
                    );
                } catch (error) {
                    sawInvalid = true;
                    lastError = error;
                }
            }
        } catch (error) {
            sawInvalid = true;
            lastError = error;
        }

        for (const source of this.#snapshotSources) {
            if (this.#closed) return null;
            try {
                const descriptor = cloneDescriptor(signed.descriptor);
                const snapshot = await this.#fetchFromSource(source, descriptor);
                if (snapshot === null || snapshot === undefined) continue;
                this.#setStatus(CONFIG_VERIFYING);
                try {
                    return await this.#cancelOnClose(
                        () => this.#verifySnapshot(signed, adapter, snapshot)
                    );
                } catch (error) {
                    sawInvalid = true;
                    lastError = error;
                }
            } catch (error) {
                sawFetchError = true;
                lastError = error;
            }
        }

        if (sawInvalid) {
            await this.#fail(CONFIG_VERIFYING, lastError);
        } else {
            const error = lastError ?? new LedgerConfigNotReadyError(
                sawFetchError
                    ? 'All ledger config snapshot sources failed.'
                    : 'Ledger config snapshot is unavailable.'
            );
            await this.#fail(CONFIG_UNAVAILABLE, error);
        }
        return null;
    }

    async #verifySnapshot(signed, adapter, snapshot) {
        const canonical = canonicalizeSnapshot(snapshot);
        const descriptor = signed.descriptor;

        if (canonical.formatVersion !== descriptor.formatVersion) {
            throw new Error('Ledger config snapshot formatVersion does not match the signed descriptor.');
        }
        if (canonical.commitmentScheme !== descriptor.commitmentScheme) {
            throw new Error('Ledger config snapshot commitmentScheme does not match the signed descriptor.');
        }
        if (canonical.schemaId !== descriptor.schemaId) {
            throw new Error('Ledger config snapshot schemaId does not match the signed descriptor.');
        }

        const contentRef = await calculateContentRef(canonical);
        if (!b4a.equals(contentRef, descriptor.contentRef)) {
            throw new Error('Ledger config snapshot contentRef does not match the signed descriptor.');
        }

        const decoded = normalizeAdapterConfig(await adapter.validate(canonical));
        const tree = await buildLedgerConfigTree(canonical);
        if (!b4a.equals(tree.root, descriptor.configRoot)) {
            throw new Error('Ledger config snapshot root does not match the signed descriptor.');
        }

        const configId = await calculateConfigId(canonical, tree.root);
        if (!b4a.equals(configId, descriptor.configId)) {
            throw new Error('Ledger config snapshot configId does not match the signed descriptor.');
        }
        const commitId = await calculateCommitId(signed.previousCommitId, configId);
        if (!b4a.equals(commitId, descriptor.commitId)) {
            throw new Error('Ledger config snapshot commitId does not match the signed descriptor.');
        }

        return { snapshot: canonical, tree, decoded };
    }

    async #fetchFromSource(source, descriptor) {
        let timeoutId = null;
        const sourceResult = Promise.resolve().then(() => {
            return typeof source === 'function'
                ? source(descriptor)
                : source.getSnapshot(descriptor);
        });
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new LedgerConfigSnapshotSourceTimeoutError(
                    this.#snapshotSourceTimeoutMs
                ));
            }, this.#snapshotSourceTimeoutMs);
        });

        try {
            return await this.#cancelOnClose(() => Promise.race([sourceResult, timeout]));
        } finally {
            if (timeoutId !== null) clearTimeout(timeoutId);
        }
    }

    async #cancelOnClose(operation) {
        if (this.#closed) throw new LedgerConfigSynchronizerClosedError();

        let rejectOnClose;
        const closed = new Promise((_, reject) => {
            rejectOnClose = reject;
        });
        this.#closeWaiters.add(rejectOnClose);
        const result = Promise.resolve().then(() => {
            if (this.#closed) throw new LedgerConfigSynchronizerClosedError();
            return operation();
        });

        try {
            return await Promise.race([result, closed]);
        } finally {
            this.#closeWaiters.delete(rejectOnClose);
        }
    }

    async #invalidate(status, error) {
        this.#activeConfig = null;
        this.#lastError = error;
        try {
            await this.#contentStore.clearReady();
        } catch (clearError) {
            this.#lastError = clearError;
            status = CONFIG_UNAVAILABLE;
        }
        this.#setStatus(status);
    }

    async #fail(status, error) {
        await this.#invalidate(status, error);
        return null;
    }

    #setStatus(status) {
        if (this.#closed && status !== CLOSED) return;
        if (this.#status === status) return;
        const previous = this.#status;
        this.#status = status;
        try {
            this.emit('status', status, previous);
        } catch {
            // Status observers cannot change synchronization safety or outcome.
        }
    }
}

export default LedgerConfigSynchronizer;
