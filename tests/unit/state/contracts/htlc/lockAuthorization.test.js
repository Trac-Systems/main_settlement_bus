import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import * as contract from '../../../../../src/core/state/contracts/htlc/lockAuthorization.js';
import * as offchain from '../../../../../src/utils/htlcLock.js';
import {testKeyPair1, testKeyPair2, testKeyPair3} from '../../../../fixtures/apply.fixtures.js';

const NETWORK_ID = 0x01020304;
const LOCKER = b4a.alloc(63, 0x11);
const implementations = [['contract', contract], ['off-chain', offchain]];

function createOperation(overrides = {}) {
    return {
        txv: b4a.alloc(32, 0x22),
        ca: b4a.alloc(63, 0x33),
        ra: b4a.alloc(63, 0x44),
        am: b4a.from('00000000000000000000000000000064', 'hex'),
        fa: b4a.alloc(16),
        hl: b4a.alloc(32, 0x55),
        re: b4a.from('0102030405060708', 'hex'),
        ss: [b4a.alloc(32, 0x66)],
        th: b4a.from([1]),
        in: b4a.alloc(32, 0x77),
        ...overrides,
    };
}

// Fixed pre-refactor bytes and hashes, independent of production serializers and constants.
// Repeated-byte fields are written compactly to keep the vectors readable.
const MESSAGE_PREFIX = [
    '01020304', '11'.repeat(63), '22'.repeat(32), '33'.repeat(63), '44'.repeat(63),
    '00000000000000000000000000000064',
].join('');
const vectors = [
    {
        name: 'no fee or metadata',
        operation: createOperation(),
        messageHex: MESSAGE_PREFIX + [
            '00'.repeat(16), '00'.repeat(63), '55'.repeat(32), '0102030405060708',
            '00000000', '01', '66'.repeat(32), '01', '77'.repeat(32), '00000011',
        ].join(''),
        hashHex: '79f807f75474d74fd2bfed651e4fd37761b74bbe9720b535b3d00d05e85b3df2',
    },
    {
        name: 'fee, metadata and multiple signers',
        operation: createOperation({
            fa: b4a.from('00000000000000000000000000000005', 'hex'),
            fr: b4a.alloc(63, 0x88),
            md: b4a.from('0080ff', 'hex'),
            ss: [b4a.alloc(32, 0x66), b4a.alloc(32, 0x22), b4a.alloc(32, 0x99)],
            th: b4a.from([2]),
        }),
        messageHex: MESSAGE_PREFIX + [
            '00000000000000000000000000000005', '88'.repeat(63), '55'.repeat(32),
            '0102030405060708', '00000003', '0080ff', '03',
            '66'.repeat(32), '22'.repeat(32), '99'.repeat(32),
            '02', '77'.repeat(32), '00000011',
        ].join(''),
        hashHex: 'f81d4013e06daf415b4386ee1c8d734bd93305ef8586c1b4ef0bfcdac8f8ce3a',
    },
];

test('HTLC lock contract and off-chain signing preserve fixed bytes and hashes', async t => {
    for (const [name, {createHtlcLockSigningMessage}] of implementations) {
        for (const vector of vectors) {
            const message = createHtlcLockSigningMessage(NETWORK_ID, LOCKER, vector.operation);
            t.is(b4a.toString(message, 'hex'), vector.messageHex, `${name}: ${vector.name} bytes`);
            t.is(b4a.toString(await tracCryptoApi.hash.blake3(message), 'hex'), vector.hashHex,
                `${name}: ${vector.name} hash`);
        }
    }
});

test('HTLC lock signing preserves byte representations and excludes authorization fields', t => {
    const vector = vectors[1];
    const operation = {
        ...vector.operation,
        ss: vector.operation.ss.map(key => new Uint8Array(key)),
        th: new Uint8Array([2]),
        tx: b4a.alloc(32, 1),
        is: b4a.alloc(64, 2),
        cs: [b4a.alloc(64, 3)],
        va: b4a.alloc(63, 4),
        vn: b4a.alloc(32, 5),
        vs: b4a.alloc(64, 6),
    };
    for (const [name, {createHtlcLockSigningMessage}] of implementations) {
        t.is(b4a.toString(createHtlcLockSigningMessage(NETWORK_ID, LOCKER, operation), 'hex'),
            vector.messageHex, name);
    }
});

test('HTLC lock contract and off-chain signing retain rejection rules', t => {
    const invalidOperations = [
        ['zero principal', {am: b4a.alloc(16)}],
        ['short hashlock', {hl: b4a.alloc(31, 1)}],
        ['zero fee with recipient', {fr: b4a.alloc(63, 1)}],
        ['nonzero fee without recipient', {fa: b4a.alloc(16, 1)}],
        ['null metadata', {md: null}],
        ['empty metadata', {md: b4a.alloc(0)}],
        ['oversized metadata', {md: b4a.alloc(1025)}],
        ['empty signer set', {ss: []}],
        ['oversized signer set', {ss: Array.from({length: 9}, (_, i) => b4a.alloc(32, i + 1))}],
        ['duplicate signer', {ss: [b4a.alloc(32, 0x66), new Uint8Array(b4a.alloc(32, 0x66))]}],
        ['unordered cosigners', {ss: [b4a.alloc(32, 0x66), b4a.alloc(32, 0x99), b4a.alloc(32, 0x22)]}],
        ['zero threshold', {th: b4a.from([0])}],
        ['unreachable threshold', {th: new Uint8Array([2])}],
    ];
    for (const [name, {createHtlcLockSigningMessage}] of implementations) {
        for (const networkId of [0, -1, 1.5, 0x100000000]) {
            t.exception(() => createHtlcLockSigningMessage(networkId, LOCKER, createOperation()),
                /network id/, `${name}: invalid network ID ${networkId}`);
        }
        for (const [reason, overrides] of invalidOperations) {
            t.exception(() => createHtlcLockSigningMessage(NETWORK_ID, LOCKER, createOperation(overrides)),
                Error, `${name}: ${reason}`);
        }
    }
});

test('HTLC lock contract and off-chain verification retain ordered cosigner matching', t => {
    const maker = b4a.from(testKeyPair1.publicKey, 'hex');
    const cosigners = [testKeyPair2, testKeyPair3]
        .map(key => ({publicKey: b4a.from(key.publicKey, 'hex'), secretKey: b4a.from(key.secretKey, 'hex')}))
        .sort((left, right) => b4a.compare(left.publicKey, right.publicKey));
    const signerSet = [maker, ...cosigners.map(key => key.publicKey)];
    const tx = b4a.alloc(32, 0x42);
    const signatures = cosigners.map(key => tracCryptoApi.signature.sign(tx, key.secretKey));
    const makerSignature = tracCryptoApi.signature.sign(tx, b4a.from(testKeyPair1.secretKey, 'hex'));

    for (const [name, {verifyOrderedHtlcCosignerSignatures: verify}] of implementations) {
        t.is(verify(signatures, tx, signerSet), true, `${name}: ordered signatures`);
        t.is(verify([signatures[1]], tx, signerSet), true, `${name}: omitted earlier cosigner`);
        t.is(verify([], tx, [maker]), true, `${name}: no cosigners`);
        t.is(verify([...signatures].reverse(), tx, signerSet), false, `${name}: reversed signatures`);
        t.is(verify([signatures[0], signatures[0]], tx, signerSet), false, `${name}: repeated signature`);
        t.is(verify([makerSignature], tx, signerSet), false, `${name}: maker cannot count as cosigner`);
        t.is(verify(signatures, b4a.alloc(32, 0x43), signerSet), false, `${name}: wrong transaction hash`);
        t.is(verify(signatures, tx, [maker]), false, `${name}: unmatched signatures`);
        t.is(verify(null, tx, signerSet), false, `${name}: invalid signatures array`);
        t.is(verify([], tx, null), false, `${name}: invalid signer set`);
    }
});
