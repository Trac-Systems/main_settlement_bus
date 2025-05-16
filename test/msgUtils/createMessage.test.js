import test from 'brittle';
import b4a from 'b4a';
import MsgUtils from '../../src/utils/msgUtils.js';

test('createMessage', async (t) => {
    const expected = b4a.alloc(32);
    for (let i = 0; i < expected.length; i++) {
        expected[i] = i;
    }
    const arg1 = expected.subarray(0, 8);
    const arg2 = expected.subarray(8, 16);
    const arg3 = expected.subarray(16, 24);
    const arg4 = expected.subarray(24, 32);

    t.test('createMessage - function can output a valid result from buffers', async (k) => {
        const result = MsgUtils.createMessage(arg1, arg2, arg3, arg4);
        k.ok(result.length === expected.length, 'Result should be the expected length');
        k.ok(b4a.equals(result, expected), 'Result should be the expected one');
    });

    t.test('createMessage - function can output a valid result from hex strings', async (k) => {
        const result = MsgUtils.createMessage(arg1.toString('hex'), arg2.toString('hex'), arg3.toString('hex'), arg4.toString('hex'));
        k.ok(result.length === expected.length, 'Result should be the expected length');
        k.ok(b4a.equals(result, expected), 'Result should be the expected one');
    });

    t.test('createMessage - function can output a valid result from mixed strings and buffers', async (k) => {
        const result = MsgUtils.createMessage(arg1.toString('hex'), arg2, arg3, arg4.toString('hex'));
        k.ok(result.length === expected.length, 'Result should be the expected length');
        k.ok(b4a.equals(result, expected), 'Result should be the expected one');
    });

    t.test('createMessage - function returns null for no arguments', async (k) => {
        const result = MsgUtils.createMessage();
        k.is(result, null, 'Result should be null for no arguments');
    });

    // TODO: This tests is working on node but not on bare. Investigate and reactivate
    // t.test('createMessage - function throws an error when invalid arguments are passed', async (k) => {
    //     try {
    //         const res = MsgUtils.createMessage(1, 2, 3, 4);
    //         k.fail('Should throw an error for invalid arguments. Returned: ' + res);
    //     } catch (e) {
    //         k.pass('Correctly threw an error for invalid arguments');
    //     }
    // });
});