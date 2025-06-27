import test from 'brittle';
import b4a from 'b4a';
import { createMessage } from '../../src/utils/buffer.js';

test('createMessage', async (t) => {
    const expected = b4a.alloc(32);
    for (let i = 0; i < 32; i++) expected[i] = i;

    const buf1 = expected.subarray(0, 8);
    const buf2 = expected.subarray(8, 16);
    const buf3 = expected.subarray(16, 24);
    const buf4 = expected.subarray(24, 32);

    t.test('createMessage - buffers only', async k => {
        const result = createMessage(buf1, buf2, buf3, buf4);
        k.is(result.length, expected.length, 'length matches');
        k.ok(b4a.equals(result, expected), 'contents match');
    });

    t.test('createMessage - numbers only', async k => {
        const nums = Array.from({ length: 8 }, (_, i) => i + 1);
        const part1 = nums.slice(0, 2);  // [1,2] → 8 bytes
        const part2 = nums.slice(2, 4);  // [3,4]
        const part3 = nums.slice(4, 6);  // [5,6]
        const part4 = nums.slice(6, 8);  // [7,8]

        const expectedNums = b4a.alloc(16);
        part1.forEach((n, i) => expectedNums.writeUInt32BE(n, i * 4));
        part2.forEach((n, i) => expectedNums.writeUInt32BE(n, 8 + i * 4));

        const result = createMessage(...part1, ...part2);
        k.is(result.length, 16, '16 bytes for 4 numbers');
        k.ok(b4a.equals(result.subarray(0, 16), expectedNums), 'BE encoding correct');
    });

    t.test('createMessage - mixed buffers and numbers', async k => {
        const num = 0x01020304;
        const partBuf = buf1;
        const result = createMessage(partBuf, num, buf2);
        k.is(result.length, 8 + 4 + 8, 'combined length');
        k.ok(b4a.equals(result.subarray(0, 8), buf1), 'first segment');
        k.is(result.readUInt32BE(8), num, 'middle segment number');
        k.ok(b4a.equals(result.subarray(12, 20), buf2), 'last segment');
    });

    t.test('createMessage - no arguments produce empty buffer', async k => {
        const result = createMessage();
        k.is(result.length, 0, 'zero length');
        k.ok(b4a.isBuffer(result), 'still a buffer');
    });

    test('createMessage - invalid inputs produce empty buffer', async t => {
        const invalids = [
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

        for (const inval of invalids) {
            const res = createMessage(inval);
            t.is(res.length, 0, `empty for ${Object.prototype.toString.call(inval)}`);
        }
    });
    
    test('createMessage - buffers pass through', async t => {
        const buf = b4a.from([1, 2, 3]);
        const res = createMessage(buf);
        t.is(res.length, buf.length);
        t.ok(b4a.equals(res, buf));
    });

    test('createMessage - valid numbers produce 4-byte BE', async t => {
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