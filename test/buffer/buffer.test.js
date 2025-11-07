import test from 'brittle';
import b4a from 'b4a';
import {createMessage, isBufferValid, safeWriteUInt32BE, deepCopyBuffer} from '../../src/utils/buffer.js';

const invalidDataTypes = [
    null,
    undefined,
    true,
    false,
    0,
    NaN,
    Infinity,
    -1,
    '',
    'string',
    Symbol('sym'),
    BigInt(10),
    [],
    {},
    () => { },
    new Date(),
    { foo: 'bar' },
    { type: '1', key: b4a.from('01', 'hex') },
    { type: 1, key: null },
    { type: 1 },
    { key: b4a.from('01', 'hex') },
    { type: 5, key: [] },
    { type: 1, key: b4a.from('01', 'hex'), bko: null },
    { type: 1, key: b4a.from('01', 'hex'), bko: 123 },
    { type: 1, key: b4a.from('01', 'hex'), bko: b4a.from('01', 'hex'), data: 'string' },
    { type: 1, key: b4a.from('01', 'hex'), bko: b4a.from('01', 'hex'), data: null },
    { type: 1, key: b4a.from('01', 'hex'), memo: 123 },
    { type: 1, key: 'string' },
    { type: 1, key: {}, bko: {} },
    { type: 'foo', key: [], bko: 'bar' },
    (() => { const a = {}; a.self = a; return a; })(),
    Object.create(null),
    new Map(),
    new Set(),
    new Float64Array([1.1, 2.2]),
    new Int16Array([1, 2, 3]),
    { type: 9999, key: b4a.from('01', 'hex') },
    { type: 1, key: 'not-a-buffer' },
    Number.MAX_SAFE_INTEGER + 1,
    -Number.MAX_SAFE_INTEGER - 1,
    { type: 1, key: b4a.from('01', 'hex'), callback: () => { } },
];

test('createMessage', async (t) => {
    const expected = b4a.alloc(32);
    for (let i = 0; i < 32; i++) expected[i] = i;

    const buf1 = expected.subarray(0, 8);
    const buf2 = expected.subarray(8, 16);
    const buf3 = expected.subarray(16, 24);
    const buf4 = expected.subarray(24, 32);

    t.test('createMessage returns concatenated buffer for multiple buffers', async k => {
        const result = createMessage(buf1, buf2, buf3, buf4);
        k.is(result.length, expected.length, 'length matches');
        k.ok(b4a.equals(result, expected), 'contents match');
    });

    t.test('createMessage encodes multiple numbers as BE UInt32 buffers', async k => {
        const nums = Array.from({ length: 8 }, (_, i) => i + 1);
        const part1 = nums.slice(0, 2);  // [1,2] - 8 bytes
        const part2 = nums.slice(2, 4);  // [3,4]
        const expectedNums = b4a.alloc(16);
        part1.forEach((n, i) => expectedNums.writeUInt32BE(n, i * 4));
        part2.forEach((n, i) => expectedNums.writeUInt32BE(n, 8 + i * 4));
        const result = createMessage(...part1, ...part2);
        k.is(result.length, 16, '16 bytes for 4 numbers');
        k.ok(b4a.equals(result.subarray(0, 16), expectedNums), 'BE encoding correct');
    });

    t.test('createMessage handles mixed buffer and number arguments', async k => {
        const num = 0x01020304;
        const result = createMessage(buf1, num, buf2);
        k.is(result.length, 8 + 4 + 8, 'combined length');
        k.ok(b4a.equals(result.subarray(0, 8), buf1), 'first segment');
        k.is(result.readUInt32BE(8), num, 'middle segment number');
        k.ok(b4a.equals(result.subarray(12, 20), buf2), 'last segment');
    });

    t.test('createMessage returns empty buffer for no arguments', async k => {
        const result = createMessage();
        k.is(result.length, 0, 'zero length');
        k.ok(b4a.isBuffer(result), 'still a buffer');
    });

    test('createMessage returns empty buffer for invalid input types', async t => {

        for (const invalidDataType of invalidDataTypes) {
            const res = createMessage(invalidDataType);
            t.is(res.length, 0, `empty for ${Object.prototype.toString.call(invalidDataType)}`);
        }
    });

    test('createMessage returns buffer unchanged if single buffer is passed', async t => {
        const buf = b4a.from([1, 2, 3]);
        const res = createMessage(buf);
        t.is(res.length, buf.length);
        t.ok(b4a.equals(res, buf));
    });

    test('createMessage encodes valid numbers as 4-byte BE buffers', async t => {
        const valid = [1, 256, 0xFFFFFFFF];
        for (const n of valid) {
            const res = createMessage(n);
            t.is(res.length, 4, `4 bytes for ${n}`);
            t.is(res.readUInt32BE(0), n);
        }
    });

    // TODO: This tests is working on node but not on bare. Investigate and reactivate
    // t.test('createMessage - function throws an error when invalid arguments are passed', async (k) => {
    //     try {
    //         const res = createMessage(1, 2, 3, 4);
    //         k.fail('Should throw an error for invalid arguments. Returned: ' + res);
    //     } catch (e) {
    //         k.pass('Correctly threw an error for invalid arguments');
    //     }
    // });
});

test('isBufferValid - positive cases', t => {
    const buf = b4a.alloc(8);
    t.ok(isBufferValid(buf, 8), 'valid buffer and size');
});

test('isBufferValid - negative case', t => {
    const buf = b4a.alloc(8);
    t.not(isBufferValid(buf, 4), 'invalid size');
    t.not(isBufferValid(b4a.alloc(0), 1), 'empty buffer, size 1');
    t.not(isBufferValid(b4a.from('abcd', 'utf8'), 10), 'buffer too short');
    t.not(isBufferValid(b4a.from('abcd', 'utf8'), 2), 'buffer too long');
});

test('safeWriteUInt32BE - positive case', t => {
    const buf = safeWriteUInt32BE(0x01020304, 0);
    t.ok(b4a.isBuffer(buf), 'returns a buffer');
    t.is(buf.length, 4, 'buffer is 4 bytes');
    t.is(buf.readUInt32BE(0), 0x01020304, 'encodes value correctly');

    const edge = safeWriteUInt32BE(0x01020304, 4);
    t.ok(b4a.isBuffer(edge), 'returns a buffer for offset at buffer end');
    t.is(edge.length, 4, 'buffer is 4 bytes');
    t.is(edge.readUInt32BE(0), 0, 'buffer is zeroed for out of bounds offset');
});

test('safeWriteUInt32BE - negative case', t => {
    const negOffset = safeWriteUInt32BE(0x01020304, -1);
    t.ok(b4a.isBuffer(negOffset), 'returns buffer for negative offset');
    t.is(negOffset.length, 4, 'buffer is 4 bytes');
    t.is(negOffset.readUInt32BE(0), 0, 'buffer is zeroed for negative offset');
});

test('deepCopyBuffer - returns null for falsy inputs', t => {
    t.is(deepCopyBuffer(null), null, 'null input returns null');
    t.is(deepCopyBuffer(undefined), null, 'undefined input returns null');
});

test('deepCopyBuffer - copies non-empty buffer', t => {
    const buf = b4a.from([1, 2, 3, 4]);
    const copy = deepCopyBuffer(buf);

    t.ok(b4a.isBuffer(copy), 'returns a buffer');
    t.is(copy.length, buf.length, 'same length');
    t.ok(b4a.equals(copy, buf), 'contents match');
    t.not(copy, buf, 'is a different buffer object');
});

test('deepCopyBuffer - copies empty buffer', t => {
    const buf = b4a.alloc(0);
    const copy = deepCopyBuffer(buf);

    t.ok(b4a.isBuffer(copy), 'returns a buffer');
    t.is(copy.length, 0, 'length is zero');
    t.not(copy, buf, 'is a different buffer object');
});

test('deepCopyBuffer - modifying copy does not affect original (is not a reference)', t => {
    const buf = b4a.from([9, 9, 9]);
    const copy = deepCopyBuffer(buf);

    copy[0] = 1;

    t.is(buf[0], 9, 'original unchanged');
    t.is(copy[0], 1, 'copy modified independently');
});
