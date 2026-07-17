import b4a from 'b4a';
import Hyperbee from 'hyperbee';
import tracCryptoApi from 'trac-crypto-api';

import {
    decodeLedgerConfigRootRecord,
    encodeLedgerConfigRootRecord,
    encodeLedgerConfigSnapshot,
    safeDecodeLedgerConfigRootRecord,
    safeDecodeLedgerConfigSnapshot,
} from '../../codecs/apply/ledgerConfigCodec.js';
import {
    DEFAULT_LEDGER_CONFIG_LIMITS,
    LEDGER_CONFIG_DOMAINS,
    LEDGER_CONFIG_HASH_BYTES,
} from './ledgerConfigConstants.js';
import {
    buildLedgerConfigTree,
    calculateCommitId,
    calculateConfigId,
    calculateContentRef,
    canonicalizeSnapshot,
} from './ledgerConfigMerkle.js';

export const LEDGER_CONFIG_CACHE_CORE_NAME = 'TracLedgerConfigModelBCacheV1';

export const LEDGER_CONFIG_CACHE_CORRUPT = 'LEDGER_CONFIG_CACHE_CORRUPT';
export const LEDGER_CONFIG_CACHE_CONFLICT = 'LEDGER_CONFIG_CACHE_CONFLICT';

const CONTENT_PREFIX = 'content/';
const NODE_PREFIX = 'nodes/';
const MANIFEST_PREFIX = 'manifests/';
const READY_KEY = 'ready/current';
const READY_MAGIC = b4a.from('LCBR1', 'ascii');
const UINT32_BASE = 0x1_0000_0000;

const NODE_TYPE = Object.freeze({
    empty: 0,
    leaf: 1,
    node: 2,
});

const NODE_TYPE_BY_TAG = Object.freeze(['empty', 'leaf', 'node']);
const DOMAIN = Object.freeze(Object.fromEntries(
    Object.entries(LEDGER_CONFIG_DOMAINS).map(([name, value]) => [name, b4a.from(value, 'utf8')])
));

export class LedgerConfigCacheCorruptionError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.code = LEDGER_CONFIG_CACHE_CORRUPT;
    }
}

export class LedgerConfigCacheConflictError extends Error {
    constructor(key) {
        super(`Immutable ledger config cache entry conflicts at ${key}.`);
        this.name = this.constructor.name;
        this.code = LEDGER_CONFIG_CACHE_CONFLICT;
        this.key = key;
    }
}

function corrupt(message) {
    return new LedgerConfigCacheCorruptionError(message);
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

function assertSafeUint(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
}

function assertUint32(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
    }
}

function assertDescriptor(descriptor, name = 'descriptor') {
    assertObject(descriptor, name);
    assertUint32(descriptor.formatVersion, `${name}.formatVersion`);
    if (typeof descriptor.commitmentScheme !== 'string' || descriptor.commitmentScheme.length === 0) {
        throw new TypeError(`${name}.commitmentScheme must be a non-empty string.`);
    }
    if (typeof descriptor.schemaId !== 'string' || descriptor.schemaId.length === 0) {
        throw new TypeError(`${name}.schemaId must be a non-empty string.`);
    }
    assertSafeUint(descriptor.configVersion, `${name}.configVersion`);
    if (descriptor.configVersion === 0) {
        throw new RangeError(`${name}.configVersion must be greater than zero.`);
    }
    assertHash(descriptor.configRoot, `${name}.configRoot`);
    assertHash(descriptor.configId, `${name}.configId`);
    assertHash(descriptor.commitId, `${name}.commitId`);
    assertHash(descriptor.contentRef, `${name}.contentRef`);
}

function hashKey(prefix, hash, name) {
    assertHash(hash, name);
    return prefix + b4a.toString(hash, 'hex');
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

function cloneRootRecord(record) {
    return {
        previousCommitId: b4a.from(record.previousCommitId),
        descriptor: cloneDescriptor(record.descriptor),
    };
}

function descriptorsEqual(left, right) {
    try {
        const leftEncoded = encodeLedgerConfigRootRecord({
            previousCommitId: left.previousCommitId,
            descriptor: left.descriptor,
        });
        const rightEncoded = encodeLedgerConfigRootRecord({
            previousCommitId: right.previousCommitId,
            descriptor: right.descriptor,
        });
        return b4a.equals(leftEncoded, rightEncoded);
    } catch {
        return false;
    }
}

function encodeUint32(value) {
    const encoded = b4a.alloc(4);
    encoded.writeUInt32BE(value, 0);
    return encoded;
}

function encodeSafeUint64(value) {
    assertSafeUint(value, 'sourceSignedLength');
    const encoded = b4a.alloc(8);
    const high = Math.floor(value / UINT32_BASE);
    const low = value % UINT32_BASE;
    encoded.writeUInt32BE(high, 0);
    encoded.writeUInt32BE(low, 4);
    return encoded;
}

function decodeSafeUint64(value, offset) {
    const high = value.readUInt32BE(offset);
    const low = value.readUInt32BE(offset + 4);
    const decoded = (high * UINT32_BASE) + low;
    if (!Number.isSafeInteger(decoded)) {
        throw corrupt('Ledger config ready sourceSignedLength is not a safe integer.');
    }
    return decoded;
}

async function hashParts(domain, ...parts) {
    const digest = await tracCryptoApi.hash.blake3(b4a.concat([domain, ...parts]));
    if (!b4a.isBuffer(digest) || digest.length !== LEDGER_CONFIG_HASH_BYTES) {
        throw new Error(`BLAKE3 must return a ${LEDGER_CONFIG_HASH_BYTES}-byte Buffer.`);
    }
    return b4a.from(digest);
}

async function calculateStoredNodeHash(node) {
    if (node.type === 'empty') {
        return await hashParts(DOMAIN.empty);
    }
    if (node.type === 'leaf') {
        return await hashParts(
            DOMAIN.leaf,
            encodeUint32(node.key.length),
            node.key,
            encodeUint32(node.value.length),
            node.value
        );
    }
    return await hashParts(DOMAIN.node, node.leftHash, node.rightHash);
}

function encodeStoredNode(node) {
    assertObject(node, 'node');
    assertHash(node.hash, 'node.hash');

    if (node.type === 'empty') {
        return b4a.from([NODE_TYPE.empty]);
    }

    if (node.type === 'leaf') {
        if (!b4a.isBuffer(node.key) || !b4a.isBuffer(node.value)) {
            throw new TypeError('Leaf node key and value must be Buffers.');
        }
        return b4a.concat([
            b4a.from([NODE_TYPE.leaf]),
            encodeUint32(node.key.length),
            node.key,
            encodeUint32(node.value.length),
            node.value,
        ]);
    }

    if (node.type === 'node') {
        assertHash(node.leftHash, 'node.leftHash');
        assertHash(node.rightHash, 'node.rightHash');
        return b4a.concat([b4a.from([NODE_TYPE.node]), node.leftHash, node.rightHash]);
    }

    throw new Error(`Unsupported ledger config node type: ${String(node.type)}.`);
}

function decodeStoredNode(encoded) {
    if (!b4a.isBuffer(encoded) || encoded.length < 1) {
        throw corrupt('Ledger config node value is malformed.');
    }

    const type = NODE_TYPE_BY_TAG[encoded[0]];
    if (type === 'empty') {
        if (encoded.length !== 1) throw corrupt('Empty ledger config node has trailing bytes.');
        return { type };
    }

    if (type === 'node') {
        const expectedLength = 1 + (2 * LEDGER_CONFIG_HASH_BYTES);
        if (encoded.length !== expectedLength) {
            throw corrupt('Branch ledger config node has an invalid length.');
        }
        return {
            type,
            leftHash: b4a.from(encoded.subarray(1, 1 + LEDGER_CONFIG_HASH_BYTES)),
            rightHash: b4a.from(encoded.subarray(1 + LEDGER_CONFIG_HASH_BYTES)),
        };
    }

    if (type !== 'leaf') {
        throw corrupt(`Unknown ledger config node tag: ${encoded[0]}.`);
    }

    try {
        let offset = 1;
        const keyLength = encoded.readUInt32BE(offset);
        offset += 4;
        if (keyLength === 0 || keyLength > DEFAULT_LEDGER_CONFIG_LIMITS.maxKeyBytes) {
            throw corrupt('Leaf ledger config node has an invalid key length.');
        }
        const keyEnd = offset + keyLength;
        if (keyEnd + 4 > encoded.length) throw corrupt('Leaf ledger config node key is truncated.');
        const key = b4a.from(encoded.subarray(offset, keyEnd));
        offset = keyEnd;
        const valueLength = encoded.readUInt32BE(offset);
        offset += 4;
        if (valueLength > DEFAULT_LEDGER_CONFIG_LIMITS.maxValueBytes) {
            throw corrupt('Leaf ledger config node has an invalid value length.');
        }
        const valueEnd = offset + valueLength;
        if (valueEnd !== encoded.length) {
            throw corrupt('Leaf ledger config node value is truncated or has trailing bytes.');
        }
        return { type, key, value: b4a.from(encoded.subarray(offset, valueEnd)) };
    } catch (error) {
        if (error instanceof LedgerConfigCacheCorruptionError) throw error;
        throw corrupt('Leaf ledger config node value is malformed.');
    }
}

async function verifiedNodeRecord(node) {
    const encoded = encodeStoredNode(node);
    const decoded = decodeStoredNode(encoded);
    const calculated = await calculateStoredNodeHash(decoded);
    if (!b4a.equals(calculated, node.hash)) {
        throw new Error(`Ledger config node hash mismatch: ${b4a.toString(node.hash, 'hex')}.`);
    }
    return { key: hashKey(NODE_PREFIX, node.hash, 'node.hash'), value: encoded };
}

function nodesEqual(left, right) {
    if (left.type !== right.type || !b4a.equals(left.hash, right.hash)) return false;
    if (left.type === 'empty') return true;
    if (left.type === 'leaf') {
        return b4a.equals(left.key, right.key) && b4a.equals(left.value, right.value);
    }
    return b4a.equals(left.leftHash, right.leftHash) &&
        b4a.equals(left.rightHash, right.rightHash);
}

function encodeReadyRecord({ sourceSignedLength, previousCommitId, descriptor }) {
    const rootRecord = encodeLedgerConfigRootRecord({ previousCommitId, descriptor });
    return b4a.concat([
        READY_MAGIC,
        b4a.from([1]),
        encodeSafeUint64(sourceSignedLength),
        rootRecord,
    ]);
}

function decodeReadyRecord(encoded) {
    const headerLength = READY_MAGIC.length + 1 + 8;
    if (!b4a.isBuffer(encoded) || encoded.length <= headerLength) {
        throw corrupt('Ledger config ready metadata is truncated.');
    }
    if (!b4a.equals(encoded.subarray(0, READY_MAGIC.length), READY_MAGIC)) {
        throw corrupt('Ledger config ready metadata has an invalid format.');
    }
    if (encoded[READY_MAGIC.length] !== 1) {
        throw corrupt('Ledger config ready metadata is not verified.');
    }
    const sourceSignedLength = decodeSafeUint64(encoded, READY_MAGIC.length + 1);
    let rootRecord;
    try {
        rootRecord = decodeLedgerConfigRootRecord(encoded.subarray(headerLength));
    } catch {
        throw corrupt('Ledger config ready descriptor is malformed.');
    }
    return {
        sourceSignedLength,
        previousCommitId: rootRecord.previousCommitId,
        descriptor: rootRecord.descriptor,
        verified: true,
    };
}

export class LedgerConfigContentStore {
    #core;
    #bee;
    #closed = false;

    constructor(corestore, { coreName = LEDGER_CONFIG_CACHE_CORE_NAME } = {}) {
        if (!corestore || typeof corestore.get !== 'function') {
            throw new TypeError('LedgerConfigContentStore requires a Corestore-compatible store.');
        }
        if (typeof coreName !== 'string' || coreName.length === 0) {
            throw new TypeError('Ledger config cache coreName must be a non-empty string.');
        }

        this.#core = corestore.get({ name: coreName });
        this.#bee = new Hyperbee(this.#core, {
            extension: false,
            keyEncoding: 'ascii',
            valueEncoding: 'binary',
        });
    }

    async ready() {
        this.#assertOpen();
        await this.#bee.ready();
        return this;
    }

    async putSnapshot(snapshot) {
        this.#assertOpen();
        const canonical = canonicalizeSnapshot(snapshot);
        const contentRef = await calculateContentRef(canonical);
        const key = hashKey(CONTENT_PREFIX, contentRef, 'contentRef');
        const encoded = encodeLedgerConfigSnapshot(canonical);
        const batch = this.#bee.batch();

        try {
            await this.#putContentRecord(batch, key, encoded, contentRef);
            await batch.flush();
        } finally {
            await batch.close();
        }

        return b4a.from(contentRef);
    }

    async getSnapshot(contentRef) {
        this.#assertOpen();
        const key = hashKey(CONTENT_PREFIX, contentRef, 'contentRef');
        const entry = await this.#bee.get(key);
        if (!entry) return null;

        const decoded = safeDecodeLedgerConfigSnapshot(entry.value);
        if (!decoded) throw corrupt(`Ledger config snapshot is corrupt at ${key}.`);

        try {
            const canonical = canonicalizeSnapshot(decoded);
            const calculated = await calculateContentRef(canonical);
            if (!b4a.equals(calculated, contentRef)) {
                throw corrupt(`Ledger config snapshot content reference mismatch at ${key}.`);
            }
            return canonical;
        } catch (error) {
            if (error instanceof LedgerConfigCacheCorruptionError) throw error;
            throw corrupt(`Ledger config snapshot is invalid at ${key}.`);
        }
    }

    async putCandidate({ snapshot, tree = undefined, descriptor, previousCommitId } = {}) {
        this.#assertOpen();
        assertDescriptor(descriptor);
        assertHash(previousCommitId, 'previousCommitId');

        const canonical = canonicalizeSnapshot(snapshot);
        const calculatedContentRef = await calculateContentRef(canonical);
        if (!b4a.equals(calculatedContentRef, descriptor.contentRef)) {
            throw new Error('Ledger config candidate contentRef does not match its descriptor.');
        }
        if (canonical.formatVersion !== descriptor.formatVersion ||
            canonical.commitmentScheme !== descriptor.commitmentScheme ||
            canonical.schemaId !== descriptor.schemaId) {
            throw new Error('Ledger config candidate container does not match its descriptor.');
        }

        const candidateTree = tree ?? await buildLedgerConfigTree(canonical);
        assertObject(candidateTree, 'tree');
        assertHash(candidateTree.root, 'tree.root');
        if (!b4a.equals(candidateTree.root, descriptor.configRoot)) {
            throw new Error('Ledger config candidate root does not match its descriptor.');
        }
        if (!Array.isArray(candidateTree.nodes)) {
            throw new TypeError('Ledger config candidate tree.nodes must be an array.');
        }

        const calculatedConfigId = await calculateConfigId(canonical, candidateTree.root);
        if (!b4a.equals(calculatedConfigId, descriptor.configId)) {
            throw new Error('Ledger config candidate configId does not match its descriptor.');
        }
        const calculatedCommitId = await calculateCommitId(previousCommitId, calculatedConfigId);
        if (!b4a.equals(calculatedCommitId, descriptor.commitId)) {
            throw new Error('Ledger config candidate commitId does not match its descriptor.');
        }

        const rootRecord = { previousCommitId, descriptor };
        // Encoding validates the complete descriptor, including its configVersion.
        const manifest = encodeLedgerConfigRootRecord(rootRecord);
        const nodeRecords = await Promise.all(candidateTree.nodes.map(verifiedNodeRecord));
        const contentKey = hashKey(CONTENT_PREFIX, calculatedContentRef, 'contentRef');
        const manifestKey = hashKey(MANIFEST_PREFIX, descriptor.commitId, 'descriptor.commitId');
        const batch = this.#bee.batch();

        try {
            await this.#putContentRecord(
                batch,
                contentKey,
                encodeLedgerConfigSnapshot(canonical),
                calculatedContentRef
            );
            for (const record of nodeRecords) {
                await this.#putNodeRecord(batch, record.key, record.value);
            }
            await this.#putManifestRecord(
                batch,
                manifestKey,
                manifest,
                descriptor.commitId,
                rootRecord
            );
            await batch.flush();
        } finally {
            await batch.close();
        }

        return cloneRootRecord(rootRecord);
    }

    async getNode(nodeHash) {
        this.#assertOpen();
        const key = hashKey(NODE_PREFIX, nodeHash, 'nodeHash');
        const entry = await this.#bee.get(key);
        if (!entry) return null;

        const decoded = decodeStoredNode(entry.value);
        const calculated = await calculateStoredNodeHash(decoded);
        if (!b4a.equals(calculated, nodeHash)) {
            throw corrupt(`Ledger config node hash mismatch at ${key}.`);
        }
        return { ...decoded, hash: b4a.from(nodeHash) };
    }

    async getManifest(commitId) {
        this.#assertOpen();
        const key = hashKey(MANIFEST_PREFIX, commitId, 'commitId');
        const entry = await this.#bee.get(key);
        if (!entry) return null;

        const decoded = safeDecodeLedgerConfigRootRecord(entry.value);
        if (!decoded) throw corrupt(`Ledger config manifest is corrupt at ${key}.`);

        try {
            assertHash(decoded.previousCommitId, 'manifest.previousCommitId');
            assertDescriptor(decoded.descriptor, 'manifest.descriptor');
            if (!b4a.equals(decoded.descriptor.commitId, commitId)) {
                throw corrupt(`Ledger config manifest commitId mismatch at ${key}.`);
            }

            const snapshot = await this.getSnapshot(decoded.descriptor.contentRef);
            if (!snapshot) throw corrupt(`Ledger config manifest content is missing at ${key}.`);
            if (snapshot.formatVersion !== decoded.descriptor.formatVersion ||
                snapshot.commitmentScheme !== decoded.descriptor.commitmentScheme ||
                snapshot.schemaId !== decoded.descriptor.schemaId) {
                throw corrupt(`Ledger config manifest container mismatch at ${key}.`);
            }

            const tree = await buildLedgerConfigTree(snapshot);
            if (!b4a.equals(tree.root, decoded.descriptor.configRoot)) {
                throw corrupt(`Ledger config manifest tree mismatch at ${key}.`);
            }
            const configId = await calculateConfigId(snapshot, tree.root);
            if (!b4a.equals(configId, decoded.descriptor.configId)) {
                throw corrupt(`Ledger config manifest configId mismatch at ${key}.`);
            }
            const calculatedCommitId = await calculateCommitId(decoded.previousCommitId, configId);
            if (!b4a.equals(calculatedCommitId, decoded.descriptor.commitId)) {
                throw corrupt(`Ledger config manifest commitId mismatch at ${key}.`);
            }

            for (const expectedNode of tree.nodes) {
                const storedNode = await this.getNode(expectedNode.hash);
                if (!storedNode || !nodesEqual(storedNode, expectedNode)) {
                    throw corrupt(`Ledger config manifest node is missing or corrupt at ${key}.`);
                }
            }

            return cloneRootRecord(decoded);
        } catch (error) {
            if (error instanceof LedgerConfigCacheCorruptionError) throw error;
            throw corrupt(`Ledger config manifest is invalid at ${key}.`);
        }
    }

    async markReady({ sourceSignedLength, descriptor, previousCommitId } = {}) {
        this.#assertOpen();
        assertSafeUint(sourceSignedLength, 'sourceSignedLength');
        assertDescriptor(descriptor);
        assertHash(previousCommitId, 'previousCommitId');

        const manifest = await this.getManifest(descriptor.commitId);
        if (!manifest || !descriptorsEqual(manifest, { previousCommitId, descriptor })) {
            throw new Error('Cannot mark an unpersisted or mismatched ledger config candidate as ready.');
        }

        const encoded = encodeReadyRecord({ sourceSignedLength, previousCommitId, descriptor });
        const batch = this.#bee.batch();
        try {
            await batch.put(READY_KEY, encoded);
            await batch.flush();
        } finally {
            await batch.close();
        }

        return {
            sourceSignedLength,
            previousCommitId: b4a.from(previousCommitId),
            descriptor: cloneDescriptor(descriptor),
            verified: true,
        };
    }

    async getReady() {
        this.#assertOpen();
        const entry = await this.#bee.get(READY_KEY);
        if (!entry) return null;

        try {
            const ready = decodeReadyRecord(entry.value);
            const manifest = await this.getManifest(ready.descriptor.commitId);
            if (!manifest || !descriptorsEqual(manifest, ready)) return null;
            return {
                sourceSignedLength: ready.sourceSignedLength,
                previousCommitId: b4a.from(ready.previousCommitId),
                descriptor: cloneDescriptor(ready.descriptor),
                verified: true,
            };
        } catch {
            return null;
        }
    }

    async clearReady() {
        this.#assertOpen();
        const batch = this.#bee.batch();
        try {
            await batch.del(READY_KEY);
            await batch.flush();
        } finally {
            await batch.close();
        }
    }

    async close() {
        if (this.#closed) return;
        this.#closed = true;
        await this.#bee.close();
        await this.#core.close();
    }

    async #putContentRecord(batch, key, value, contentRef) {
        const existing = await batch.get(key);
        if (!existing) {
            await batch.put(key, value);
            return;
        }
        if (b4a.equals(existing.value, value)) return;

        try {
            const decoded = safeDecodeLedgerConfigSnapshot(existing.value);
            if (decoded) {
                const canonical = canonicalizeSnapshot(decoded);
                const calculated = await calculateContentRef(canonical);
                if (b4a.equals(calculated, contentRef)) return;
            }
        } catch {
            // A corrupt derived entry is safely replaced by verified content.
        }

        await batch.put(key, value);
    }

    async #putNodeRecord(batch, key, value) {
        const existing = await batch.get(key);
        if (!existing) {
            await batch.put(key, value);
            return;
        }
        if (b4a.equals(existing.value, value)) return;

        try {
            const expectedHash = b4a.from(key.slice(NODE_PREFIX.length), 'hex');
            const decoded = decodeStoredNode(existing.value);
            const calculated = await calculateStoredNodeHash(decoded);
            if (b4a.equals(calculated, expectedHash)) return;
        } catch {
            // A corrupt derived entry is safely replaced by a verified node.
        }

        await batch.put(key, value);
    }

    async #putManifestRecord(batch, key, value, commitId, expectedRecord) {
        const existing = await batch.get(key);
        if (!existing) {
            await batch.put(key, value);
            return;
        }
        if (b4a.equals(existing.value, value)) return;

        let existingManifest = null;
        try {
            existingManifest = await this.getManifest(commitId);
        } catch {
            // A corrupt derived manifest is repaired below.
        }

        if (existingManifest) {
            if (descriptorsEqual(existingManifest, expectedRecord)) return;
            throw new LedgerConfigCacheConflictError(key);
        }

        await batch.put(key, value);
    }

    #assertOpen() {
        if (this.#closed) throw new Error('LedgerConfigContentStore is closed.');
    }
}

export default LedgerConfigContentStore;
