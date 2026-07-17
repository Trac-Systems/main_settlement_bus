import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {
    DEFAULT_LEDGER_CONFIG_LIMITS,
    LEDGER_CONFIG_COMMITMENT_SCHEME,
    LEDGER_CONFIG_DOMAINS,
    LEDGER_CONFIG_FORMAT_VERSION,
    LEDGER_CONFIG_HASH_BYTES,
    MAX_LEDGER_CONFIG_ENTRIES,
} from './ledgerConfigConstants.js';

const UINT32_MAX = 0xFFFFFFFF;

const DOMAIN = Object.freeze(Object.fromEntries(
    Object.entries(LEDGER_CONFIG_DOMAINS).map(([name, value]) => [name, b4a.from(value, 'utf8')])
));

function encodeUint32(value) {
    const encoded = b4a.alloc(4);
    encoded.writeUInt32BE(value, 0);
    return encoded;
}

function assertObject(value, name) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${name} must be an object.`);
    }
}

function assertBuffer(value, name) {
    if (!b4a.isBuffer(value)) {
        throw new TypeError(`${name} must be a Buffer.`);
    }
}

function assertUint32(value, name) {
    if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
        throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
    }
}

function assertLimit(value, name) {
    if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
        throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
    }
}

function resolveLimits(overrides = undefined) {
    if (overrides === undefined) {
        return DEFAULT_LEDGER_CONFIG_LIMITS;
    }

    assertObject(overrides, 'limits');
    const limits = { ...DEFAULT_LEDGER_CONFIG_LIMITS };

    for (const [name, value] of Object.entries(overrides)) {
        if (!Object.hasOwn(DEFAULT_LEDGER_CONFIG_LIMITS, name)) {
            throw new TypeError(`Unknown ledger config limit: ${name}.`);
        }
        assertLimit(value, `limits.${name}`);
        if (value > DEFAULT_LEDGER_CONFIG_LIMITS[name]) {
            throw new RangeError(
                `limits.${name} exceeds the binary-merkle-v1 protocol maximum.`
            );
        }
        limits[name] = value;
    }

    return limits;
}

function hasUnpairedSurrogate(value) {
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index);

        if (unit >= 0xD800 && unit <= 0xDBFF) {
            if (index + 1 >= value.length) return true;
            const next = value.charCodeAt(index + 1);
            if (next < 0xDC00 || next > 0xDFFF) return true;
            index++;
        } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
            return true;
        }
    }

    return false;
}

function encodedSnapshotSize(snapshot, schemeBytes, schemaBytes) {
    let size = 4 + 4 + schemeBytes.length + 4 + schemaBytes.length + 4;

    for (const entry of snapshot.entries) {
        size += 4 + entry.key.length + 4 + entry.value.length;
        if (!Number.isSafeInteger(size)) {
            throw new RangeError('Ledger config snapshot size is not a safe integer.');
        }
    }

    return size;
}

function cloneEntry(entry) {
    return {
        key: b4a.from(entry.key),
        value: b4a.from(entry.value),
    };
}

/**
 * Validates a generic v1 snapshot and returns an independently owned,
 * byte-lexicographically sorted copy.
 */
export function canonicalizeSnapshot(snapshot, limitOverrides = undefined) {
    assertObject(snapshot, 'snapshot');
    const limits = resolveLimits(limitOverrides);

    assertUint32(snapshot.formatVersion, 'snapshot.formatVersion');
    if (snapshot.formatVersion !== LEDGER_CONFIG_FORMAT_VERSION) {
        throw new Error(`Unsupported ledger config format version: ${snapshot.formatVersion}.`);
    }

    if (snapshot.commitmentScheme !== LEDGER_CONFIG_COMMITMENT_SCHEME) {
        throw new Error(`Unsupported ledger config commitment scheme: ${snapshot.commitmentScheme}.`);
    }

    if (typeof snapshot.schemaId !== 'string' || snapshot.schemaId.length === 0) {
        throw new TypeError('snapshot.schemaId must be a non-empty string.');
    }
    if (hasUnpairedSurrogate(snapshot.schemaId)) {
        throw new Error('snapshot.schemaId must contain valid Unicode scalar values.');
    }

    const schemeBytes = b4a.from(snapshot.commitmentScheme, 'utf8');
    const schemaBytes = b4a.from(snapshot.schemaId, 'utf8');
    if (schemaBytes.length > limits.maxSchemaIdBytes) {
        throw new RangeError(`snapshot.schemaId exceeds ${limits.maxSchemaIdBytes} bytes.`);
    }

    if (!Array.isArray(snapshot.entries)) {
        throw new TypeError('snapshot.entries must be an array.');
    }
    if (snapshot.entries.length > limits.maxEntries) {
        throw new RangeError(`snapshot.entries exceeds ${limits.maxEntries} entries.`);
    }

    const entries = snapshot.entries.map((entry, index) => {
        assertObject(entry, `snapshot.entries[${index}]`);
        assertBuffer(entry.key, `snapshot.entries[${index}].key`);
        assertBuffer(entry.value, `snapshot.entries[${index}].value`);

        if (entry.key.length === 0) {
            throw new Error(`snapshot.entries[${index}].key must not be empty.`);
        }
        if (entry.key.length > limits.maxKeyBytes) {
            throw new RangeError(`snapshot.entries[${index}].key exceeds ${limits.maxKeyBytes} bytes.`);
        }
        if (entry.value.length > limits.maxValueBytes) {
            throw new RangeError(`snapshot.entries[${index}].value exceeds ${limits.maxValueBytes} bytes.`);
        }

        return cloneEntry(entry);
    });

    entries.sort((left, right) => b4a.compare(left.key, right.key));

    for (let index = 1; index < entries.length; index++) {
        if (b4a.equals(entries[index - 1].key, entries[index].key)) {
            throw new Error(`snapshot.entries contains duplicate key ${b4a.toString(entries[index].key, 'hex')}.`);
        }
    }

    const canonical = {
        formatVersion: snapshot.formatVersion,
        commitmentScheme: snapshot.commitmentScheme,
        schemaId: snapshot.schemaId,
        entries,
    };
    const size = encodedSnapshotSize(canonical, schemeBytes, schemaBytes);
    if (size > limits.maxSnapshotBytes) {
        throw new RangeError(`Ledger config snapshot exceeds ${limits.maxSnapshotBytes} bytes.`);
    }

    return canonical;
}

function encodeCanonicalSnapshotUnchecked(snapshot) {
    const scheme = b4a.from(snapshot.commitmentScheme, 'utf8');
    const schema = b4a.from(snapshot.schemaId, 'utf8');
    const parts = [
        encodeUint32(snapshot.formatVersion),
        encodeUint32(scheme.length),
        scheme,
        encodeUint32(schema.length),
        schema,
        encodeUint32(snapshot.entries.length),
    ];

    for (const entry of snapshot.entries) {
        parts.push(
            encodeUint32(entry.key.length),
            entry.key,
            encodeUint32(entry.value.length),
            entry.value
        );
    }

    return b4a.concat(parts);
}

export function encodeCanonicalSnapshot(snapshot, limitOverrides = undefined) {
    return encodeCanonicalSnapshotUnchecked(canonicalizeSnapshot(snapshot, limitOverrides));
}

async function hashParts(domain, ...parts) {
    const digest = await tracCryptoApi.hash.blake3(b4a.concat([domain, ...parts]));
    if (!b4a.isBuffer(digest) || digest.length !== LEDGER_CONFIG_HASH_BYTES) {
        throw new Error(`BLAKE3 must return a ${LEDGER_CONFIG_HASH_BYTES}-byte Buffer.`);
    }
    return b4a.from(digest);
}

async function hashLeaf(entry) {
    return await hashParts(
        DOMAIN.leaf,
        encodeUint32(entry.key.length),
        entry.key,
        encodeUint32(entry.value.length),
        entry.value
    );
}

async function hashNode(left, right) {
    return await hashParts(DOMAIN.node, left, right);
}

function largestPowerOfTwoBelow(value) {
    let result = 1;
    while (result * 2 < value) result *= 2;
    return result;
}

async function buildRange(leaves, start, end) {
    const count = end - start;
    if (count === 1) return leaves[start];

    const split = start + largestPowerOfTwoBelow(count);
    const [left, right] = await Promise.all([
        buildRange(leaves, start, split),
        buildRange(leaves, split, end),
    ]);
    const hash = await hashNode(left.hash, right.hash);
    const node = {
        type: 'node',
        hash,
        left,
        right,
        start,
        end,
    };

    return {
        ...node,
        allNodes: [
            ...(left.allNodes || [left]),
            ...(right.allNodes || [right]),
            node,
        ],
    };
}

function findEntryIndex(entries, key) {
    let lower = 0;
    let upper = entries.length - 1;

    while (lower <= upper) {
        const middle = lower + Math.floor((upper - lower) / 2);
        const comparison = b4a.compare(entries[middle].key, key);
        if (comparison === 0) return middle;
        if (comparison < 0) lower = middle + 1;
        else upper = middle - 1;
    }

    return -1;
}

function collectSiblings(node, leafIndex, siblings) {
    if (node.type === 'leaf') return;

    if (leafIndex < node.left.end) {
        collectSiblings(node.left, leafIndex, siblings);
        siblings.push({
            position: 'right',
            size: node.right.end - node.right.start,
            hash: b4a.from(node.right.hash),
        });
    } else {
        collectSiblings(node.right, leafIndex, siblings);
        siblings.push({
            position: 'left',
            size: node.left.end - node.left.start,
            hash: b4a.from(node.left.hash),
        });
    }
}

function publicNode(node) {
    if (node.type === 'leaf') {
        return {
            type: 'leaf',
            size: 1,
            hash: b4a.from(node.hash),
            key: b4a.from(node.key),
            value: b4a.from(node.value),
        };
    }
    if (node.type === 'empty') {
        return { type: 'empty', size: 0, hash: b4a.from(node.hash) };
    }

    return {
        type: 'node',
        size: node.end - node.start,
        hash: b4a.from(node.hash),
        leftHash: b4a.from(node.left.hash),
        rightHash: b4a.from(node.right.hash),
    };
}

/**
 * Builds the canonical v1 binary Merkle tree. Public buffers are copies; the
 * proof closure retains separate immutable-by-convention internal buffers.
 */
export async function buildLedgerConfigTree(snapshot, limitOverrides = undefined) {
    const canonical = canonicalizeSnapshot(snapshot, limitOverrides);

    if (canonical.entries.length === 0) {
        const hash = await hashParts(DOMAIN.empty);
        const emptyNode = { type: 'empty', hash };

        return {
            root: b4a.from(hash),
            entries: [],
            nodes: [publicNode(emptyNode)],
            getProof(key) {
                assertBuffer(key, 'key');
                return null;
            },
        };
    }

    const leafHashes = await Promise.all(canonical.entries.map(entry => hashLeaf(entry)));
    const leaves = canonical.entries.map((entry, index) => ({
        type: 'leaf',
        hash: leafHashes[index],
        key: entry.key,
        value: entry.value,
        start: index,
        end: index + 1,
    }));
    const tree = await buildRange(leaves, 0, leaves.length);
    const allNodes = tree.allNodes || [tree];

    return {
        root: b4a.from(tree.hash),
        entries: leaves.map((leaf, index) => ({
            index,
            key: b4a.from(leaf.key),
            value: b4a.from(leaf.value),
            leafHash: b4a.from(leaf.hash),
        })),
        nodes: allNodes.map(publicNode),
        getProof(key) {
            assertBuffer(key, 'key');
            const leafIndex = findEntryIndex(canonical.entries, key);
            if (leafIndex === -1) return null;

            const siblings = [];
            collectSiblings(tree, leafIndex, siblings);
            return {
                formatVersion: LEDGER_CONFIG_FORMAT_VERSION,
                commitmentScheme: LEDGER_CONFIG_COMMITMENT_SCHEME,
                leafIndex,
                leafCount: leaves.length,
                siblings,
            };
        },
    };
}

function expectedProofSteps(leafIndex, leafCount) {
    if (leafCount === 1) return [];

    const split = largestPowerOfTwoBelow(leafCount);
    if (leafIndex < split) {
        return [
            ...expectedProofSteps(leafIndex, split),
            { position: 'right', size: leafCount - split },
        ];
    }

    return [
        ...expectedProofSteps(leafIndex - split, leafCount - split),
        { position: 'left', size: split },
    ];
}

export async function verifyLedgerConfigInclusionProof(input = {}) {
    try {
        assertObject(input, 'input');
        const { root, key, value, proof } = input;
        assertBuffer(root, 'root');
        assertBuffer(key, 'key');
        assertBuffer(value, 'value');
        assertObject(proof, 'proof');

        if (root.length !== LEDGER_CONFIG_HASH_BYTES) return false;
        if (key.length === 0 || key.length > DEFAULT_LEDGER_CONFIG_LIMITS.maxKeyBytes) return false;
        if (value.length > DEFAULT_LEDGER_CONFIG_LIMITS.maxValueBytes) return false;
        if (proof.formatVersion !== LEDGER_CONFIG_FORMAT_VERSION) return false;
        if (proof.commitmentScheme !== LEDGER_CONFIG_COMMITMENT_SCHEME) return false;
        if (!Number.isInteger(proof.leafCount) || proof.leafCount < 1 ||
            proof.leafCount > MAX_LEDGER_CONFIG_ENTRIES) return false;
        if (!Number.isInteger(proof.leafIndex) || proof.leafIndex < 0 ||
            proof.leafIndex >= proof.leafCount) return false;
        if (!Array.isArray(proof.siblings)) return false;

        const steps = expectedProofSteps(proof.leafIndex, proof.leafCount);
        if (steps.length !== proof.siblings.length) return false;

        const expectedRoot = b4a.from(root);
        const leaf = { key: b4a.from(key), value: b4a.from(value) };
        const siblings = proof.siblings.map((sibling, index) => {
            assertObject(sibling, `proof.siblings[${index}]`);
            assertBuffer(sibling.hash, `proof.siblings[${index}].hash`);

            if (sibling.position !== steps[index].position) return null;
            if (sibling.size !== steps[index].size) return null;
            if (sibling.hash.length !== LEDGER_CONFIG_HASH_BYTES) return null;

            return {
                position: sibling.position,
                hash: b4a.from(sibling.hash),
            };
        });
        if (siblings.some(sibling => sibling === null)) return false;

        let candidate = await hashLeaf(leaf);
        for (let index = 0; index < steps.length; index++) {
            const sibling = siblings[index];

            candidate = sibling.position === 'left'
                ? await hashNode(sibling.hash, candidate)
                : await hashNode(candidate, sibling.hash);
        }

        return b4a.equals(candidate, expectedRoot);
    } catch {
        return false;
    }
}

function assertHash(value, name) {
    assertBuffer(value, name);
    if (value.length !== LEDGER_CONFIG_HASH_BYTES) {
        throw new RangeError(`${name} must be ${LEDGER_CONFIG_HASH_BYTES} bytes.`);
    }
}

export async function calculateConfigId(snapshot, root, limitOverrides = undefined) {
    assertHash(root, 'root');
    const canonical = canonicalizeSnapshot(snapshot, limitOverrides);
    const scheme = b4a.from(canonical.commitmentScheme, 'utf8');
    const schema = b4a.from(canonical.schemaId, 'utf8');

    return await hashParts(
        DOMAIN.id,
        encodeUint32(canonical.formatVersion),
        encodeUint32(scheme.length),
        scheme,
        encodeUint32(schema.length),
        schema,
        root
    );
}

export async function calculateCommitId(previousCommitId, configId) {
    assertHash(previousCommitId, 'previousCommitId');
    assertHash(configId, 'configId');
    return await hashParts(DOMAIN.commit, previousCommitId, configId);
}

export async function calculateContentRef(snapshot, limitOverrides = undefined) {
    const encoded = encodeCanonicalSnapshot(snapshot, limitOverrides);
    return await hashParts(DOMAIN.content, encoded);
}
