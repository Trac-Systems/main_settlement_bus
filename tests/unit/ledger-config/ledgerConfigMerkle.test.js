import { test } from 'brittle';
import b4a from 'b4a';

import {
    DEFAULT_LEDGER_CONFIG_LIMITS,
    LEDGER_CONFIG_COMMITMENT_SCHEME,
    LEDGER_CONFIG_FORMAT_VERSION,
    MAX_LEDGER_CONFIG_OPERATION_BYTES,
    MAX_LEDGER_CONFIG_SNAPSHOT_BYTES,
    buildLedgerConfigTree,
    calculateCommitId,
    calculateConfigId,
    calculateContentRef,
    canonicalizeSnapshot,
    createZeroCommitId,
    encodeCanonicalSnapshot,
    verifyLedgerConfigInclusionProof,
} from '../../../src/core/ledger-config/index.js';

const FIXED_VECTORS = Object.freeze({
    emptyRoot: '5dc63f367df44d1298da8dbb9d134c578160e8dad38de3b6da5a383eafcafaaf',
    leafA: 'ea1f7b83ef8ff5841200ffaa944e0782d101896ca647f92e1c1ad99be9606dcb',
    leafB: '1fd9e4c5acd4024fc24c7c0026017e049cdcbc56832900b5c71182c61397101e',
    leafC: 'b4507f08dcaa4f4c8c49d4000c5725cc3d966b4e0f227ebda1ea64c1b09b0bb8',
    root1: 'ea1f7b83ef8ff5841200ffaa944e0782d101896ca647f92e1c1ad99be9606dcb',
    root2: '3556ac5188e22709a753eeb411fc2c18ad0f81b16ef28ed47e3e5eb2558b813c',
    root3: '89512f016a76aef22279789f0784625d4b7384f805861cbda14a946375bd6095',
    root5: 'a21ab7598a7289aba1d817b5f5609ff4de0bfc3072ee08438a8fc176f92c32c2',
    root7: 'b6600c412d80c17bf998a9332fc2a297f6dc9a62d7214e2965dbd7771b06ab7a',
    canonicalSnapshot: '000000010000001062696e6172792d6d65726b6c652d76310000000e' +
        '746573742f736368656d612f7631000000030000000161000000010100000001620000000102' +
        '00000001630000000103',
    configId: '24702e3735dee537724e27f6981f502df038a430e85fc2a35c5f2e3069e2e1ac',
    contentRef: '2367352e85e57d480975b10fb4374cc916600efc188c940df5020a6efe9efece',
    commitId: 'c06a6183e852422ae5f516f6fccdfded92257ac4f0247bdd300cf1e90b7f9a52',
});

function makeEntry(key, value) {
    return {
        key: typeof key === 'string' ? b4a.from(key, 'utf8') : b4a.from(key),
        value: typeof value === 'number' ? b4a.from([value]) : b4a.from(value),
    };
}

function makeSnapshot(entries, overrides = {}) {
    return {
        formatVersion: LEDGER_CONFIG_FORMAT_VERSION,
        commitmentScheme: LEDGER_CONFIG_COMMITMENT_SCHEME,
        schemaId: 'test/schema/v1',
        entries,
        ...overrides,
    };
}

function toHex(value) {
    return b4a.toString(value, 'hex');
}

function permutations(values) {
    if (values.length < 2) return [values.slice()];

    return values.flatMap((value, index) => permutations([
        ...values.slice(0, index),
        ...values.slice(index + 1),
    ]).map(rest => [value, ...rest]));
}

function cloneProof(proof) {
    return {
        ...proof,
        siblings: proof.siblings.map(sibling => ({
            position: sibling.position,
            size: sibling.size,
            hash: b4a.from(sibling.hash),
        })),
    };
}

test('ledger config canonicalization is byte-sorted and permutation-independent', async t => {
    const entries = [
        makeEntry(b4a.from('ff', 'hex'), 3),
        makeEntry(b4a.from('00ff', 'hex'), 1),
        makeEntry(b4a.from('61', 'hex'), 2),
    ];
    const roots = new Set();
    const contentRefs = new Set();

    for (const permutation of permutations(entries)) {
        const snapshot = makeSnapshot(permutation);
        const canonical = canonicalizeSnapshot(snapshot);
        const tree = await buildLedgerConfigTree(snapshot);

        t.alike(canonical.entries.map(entry => toHex(entry.key)), ['00ff', '61', 'ff']);
        roots.add(toHex(tree.root));
        contentRefs.add(toHex(await calculateContentRef(snapshot)));
    }

    t.is(roots.size, 1, 'all entry permutations produce one root');
    t.is(contentRefs.size, 1, 'all entry permutations produce one content reference');
});

test('ledger config v1 fixed vectors cover empty and one/two/three-leaf trees', async t => {
    const entries = [makeEntry('a', 1), makeEntry('b', 2), makeEntry('c', 3)];
    const expectedRoots = [FIXED_VECTORS.root1, FIXED_VECTORS.root2, FIXED_VECTORS.root3];
    const expectedLeaves = [FIXED_VECTORS.leafA, FIXED_VECTORS.leafB, FIXED_VECTORS.leafC];
    const emptyTree = await buildLedgerConfigTree(makeSnapshot([]));

    t.is(toHex(emptyTree.root), FIXED_VECTORS.emptyRoot);
    t.is(emptyTree.nodes.length, 1);
    t.is(emptyTree.nodes[0].type, 'empty');
    t.is(emptyTree.getProof(b4a.from('a')), null);

    for (let count = 1; count <= entries.length; count++) {
        const snapshot = makeSnapshot(entries.slice(0, count).reverse());
        const tree = await buildLedgerConfigTree(snapshot);

        t.is(toHex(tree.root), expectedRoots[count - 1], `${count}-leaf root matches vector`);
        t.is(tree.nodes.length, (2 * count) - 1);
        t.alike(
            tree.entries.map(entry => toHex(entry.leafHash)),
            expectedLeaves.slice(0, count)
        );

        for (const entry of tree.entries) {
            const proof = tree.getProof(entry.key);
            t.ok(await verifyLedgerConfigInclusionProof({
                root: tree.root,
                key: entry.key,
                value: entry.value,
                proof,
            }));
        }
    }

    const snapshot = makeSnapshot(entries.slice().reverse());
    const tree = await buildLedgerConfigTree(snapshot);
    const configId = await calculateConfigId(snapshot, tree.root);

    t.is(toHex(encodeCanonicalSnapshot(snapshot)), FIXED_VECTORS.canonicalSnapshot);
    t.is(toHex(configId), FIXED_VECTORS.configId);
    t.is(toHex(await calculateContentRef(snapshot)), FIXED_VECTORS.contentRef);
    t.is(toHex(await calculateCommitId(createZeroCommitId(), configId)), FIXED_VECTORS.commitId);
});

test('three-leaf proofs follow the RFC 6962 recursive split without duplication', async t => {
    const snapshot = makeSnapshot([
        makeEntry('a', 1),
        makeEntry('b', 2),
        makeEntry('c', 3),
    ]);
    const tree = await buildLedgerConfigTree(snapshot);

    t.alike(tree.nodes.map(node => node.type), ['leaf', 'leaf', 'node', 'leaf', 'node']);
    t.alike(
        tree.getProof(b4a.from('a')).siblings.map(sibling => sibling.position),
        ['right', 'right']
    );
    t.alike(
        tree.getProof(b4a.from('b')).siblings.map(sibling => sibling.position),
        ['left', 'right']
    );
    t.alike(
        tree.getProof(b4a.from('c')).siblings.map(sibling => sibling.position),
        ['left']
    );
    t.is(tree.getProof(b4a.from('missing')), null);
});

test('five- and seven-leaf fixed vectors cover deeper RFC 6962 split topology', async t => {
    const entries = Array.from({ length: 7 }, (_, index) => (
        makeEntry(String.fromCharCode(0x61 + index), index + 1)
    ));

    for (const [count, expectedRoot] of [
        [5, FIXED_VECTORS.root5],
        [7, FIXED_VECTORS.root7],
    ]) {
        const tree = await buildLedgerConfigTree(makeSnapshot(entries.slice(0, count)));
        t.is(toHex(tree.root), expectedRoot, `${count}-leaf root matches vector`);
        t.is(tree.nodes.length, (2 * count) - 1);

        for (const entry of [tree.entries[0], tree.entries[count - 1]]) {
            t.ok(await verifyLedgerConfigInclusionProof({
                root: tree.root,
                key: entry.key,
                value: entry.value,
                proof: tree.getProof(entry.key),
            }));
        }
    }

    const tree5 = await buildLedgerConfigTree(makeSnapshot(entries.slice(0, 5)));
    t.alike(
        tree5.getProof(b4a.from('e')).siblings.map(({ position, size }) => ({ position, size })),
        [{ position: 'left', size: 4 }]
    );

    const tree7 = await buildLedgerConfigTree(makeSnapshot(entries));
    t.alike(
        tree7.getProof(b4a.from('g')).siblings.map(({ position, size }) => ({ position, size })),
        [{ position: 'left', size: 2 }, { position: 'left', size: 4 }]
    );
});

test('inclusion proof verification rejects mutated data and non-canonical paths', async t => {
    const snapshot = makeSnapshot([
        makeEntry('a', 1),
        makeEntry('b', 2),
        makeEntry('c', 3),
    ]);
    const tree = await buildLedgerConfigTree(snapshot);
    const key = b4a.from('b');
    const value = b4a.from([2]);
    const proof = tree.getProof(key);
    const verify = async overrides => await verifyLedgerConfigInclusionProof({
        root: tree.root,
        key,
        value,
        proof,
        ...overrides,
    });

    t.ok(await verify());
    t.is(await verify({ root: b4a.alloc(32, 7) }), false);
    t.is(await verify({ key: b4a.from('x') }), false);
    t.is(await verify({ value: b4a.from([9]) }), false);

    const changedHash = cloneProof(proof);
    changedHash.siblings[0].hash[0] ^= 0x01;
    t.is(await verify({ proof: changedHash }), false);

    const changedPosition = cloneProof(proof);
    changedPosition.siblings[0].position = 'right';
    t.is(await verify({ proof: changedPosition }), false);

    const changedSize = cloneProof(proof);
    changedSize.siblings[0].size++;
    t.is(await verify({ proof: changedSize }), false);

    t.is(await verify({ proof: { ...cloneProof(proof), leafIndex: 0 } }), false);
    t.is(await verify({ proof: { ...cloneProof(proof), leafCount: 4 } }), false);
    t.is(await verify({
        proof: { ...cloneProof(proof), commitmentScheme: 'another-scheme' },
    }), false);
    t.is(await verify({
        proof: { ...cloneProof(proof), formatVersion: 2 },
    }), false);
    t.is(await verify({
        proof: { ...cloneProof(proof), siblings: proof.siblings.slice(1) },
    }), false);
    t.is(await verify({
        proof: {
            ...cloneProof(proof),
            siblings: [...proof.siblings, { position: 'left', size: 1, hash: b4a.alloc(32) }],
        },
    }), false);
    t.is(await verifyLedgerConfigInclusionProof(null), false);
});

test('snapshot validation rejects empty keys, duplicate keys, and invalid containers', async t => {
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([
        makeEntry(b4a.alloc(0), b4a.alloc(0)),
    ])));
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([
        makeEntry('same', 1),
        makeEntry('same', 2),
    ])));
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([], { schemaId: '' })));
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([], { schemaId: '\uD800' })));
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([], { formatVersion: 2 })));
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([], {
        commitmentScheme: 'binary-merkle-v2',
    })));

    const typedArraySnapshot = makeSnapshot([
        { key: new Uint8Array([1]), value: new Uint8Array([2]) },
    ]);
    t.is(toHex(canonicalizeSnapshot(typedArraySnapshot).entries[0].key), '01');

    const emptyValueSnapshot = makeSnapshot([makeEntry('empty-value', b4a.alloc(0))]);
    const tree = await buildLedgerConfigTree(emptyValueSnapshot);
    t.ok(await verifyLedgerConfigInclusionProof({
        root: tree.root,
        key: tree.entries[0].key,
        value: tree.entries[0].value,
        proof: tree.getProof(tree.entries[0].key),
    }), 'an empty opaque value remains valid');
});

test('snapshot validation enforces each generic resource limit', async t => {
    const twoEntries = makeSnapshot([makeEntry('a', 1), makeEntry('b', 2)]);
    await t.exception.all(() => canonicalizeSnapshot(twoEntries, { maxEntries: 1 }));
    await t.exception.all(() => canonicalizeSnapshot(
        makeSnapshot([makeEntry('ab', 1)]),
        { maxKeyBytes: 1 }
    ));
    await t.exception.all(() => canonicalizeSnapshot(
        makeSnapshot([makeEntry('a', b4a.from([1, 2]))]),
        { maxValueBytes: 1 }
    ));
    await t.exception.all(() => canonicalizeSnapshot(
        makeSnapshot([], { schemaId: 'ab' }),
        { maxSchemaIdBytes: 1 }
    ));

    const snapshot = makeSnapshot([makeEntry('a', 1)]);
    const encodedSize = encodeCanonicalSnapshot(snapshot).length;
    await t.exception.all(() => canonicalizeSnapshot(snapshot, {
        maxSnapshotBytes: encodedSize - 1,
    }));
    await t.exception.all(() => canonicalizeSnapshot(makeSnapshot([
        makeEntry('a', b4a.alloc(DEFAULT_LEDGER_CONFIG_LIMITS.maxValueBytes + 1)),
    ])));
    await t.exception.all(() => canonicalizeSnapshot(snapshot, { maxEntries: -1 }));
    await t.exception.all(() => canonicalizeSnapshot(snapshot, { unknownLimit: 1 }));
    await t.exception.all(() => canonicalizeSnapshot(snapshot, {
        maxEntries: DEFAULT_LEDGER_CONFIG_LIMITS.maxEntries + 1,
    }));

    t.is(MAX_LEDGER_CONFIG_OPERATION_BYTES, MAX_LEDGER_CONFIG_SNAPSHOT_BYTES + 4_096);
});

test('canonical snapshots, tree results, and proofs do not alias caller buffers', async t => {
    const key = b4a.from('key');
    const value = b4a.from('value');
    const snapshot = makeSnapshot([makeEntry(key, value)]);
    const canonical = canonicalizeSnapshot(snapshot);
    const tree = await buildLedgerConfigTree(snapshot);
    const originalRoot = b4a.from(tree.root);
    const originalProof = tree.getProof(b4a.from('key'));

    snapshot.entries[0].key.fill(0);
    snapshot.entries[0].value.fill(0);
    tree.entries[0].key.fill(0);
    tree.entries[0].leafHash.fill(0);
    tree.nodes[0].hash.fill(0);

    t.is(toHex(canonical.entries[0].key), toHex(key));
    t.is(toHex(canonical.entries[0].value), toHex(value));
    t.ok(await verifyLedgerConfigInclusionProof({
        root: originalRoot,
        key,
        value,
        proof: originalProof,
    }));

    const concurrentRoot = b4a.from(originalRoot);
    const concurrentProof = cloneProof(originalProof);
    const pendingVerification = verifyLedgerConfigInclusionProof({
        root: concurrentRoot,
        key,
        value,
        proof: concurrentProof,
    });
    concurrentRoot.fill(0);
    t.ok(await pendingVerification, 'verification snapshots buffers before asynchronous hashing');

    const zero = createZeroCommitId();
    const anotherZero = createZeroCommitId();
    zero[0] = 0xFF;
    t.is(anotherZero[0], 0, 'fresh zero commit IDs do not alias each other');
});
