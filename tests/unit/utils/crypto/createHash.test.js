import test from 'brittle';
import b4a from 'b4a';
import { blake3Hash} from '../../../../src/utils/crypto.js';

test('blake3', async (t) => {
    t.test('blake3Hash', async (k) => {
        const hash = await blake3Hash('test');
        const expectedResult = b4a.from("4878ca0425c739fa427f7eda20fe845f6b2e46ba5fe2a14df5b1e32f50603215", 'hex');
        k.ok(b4a.isBuffer(hash), 'Hash should be a buffer');
        k.ok(hash.length === 32, 'Hash should be 32 bytes long');
        k.ok(hash.equals(expectedResult), 'Hash result should be the expected one');
        k.ok(hash.equals(await blake3Hash('test')), 'Hash should be the same for the same input');
        k.ok(!hash.equals(await blake3Hash('Test')), 'Hash should be different for different inputs');
    });
});