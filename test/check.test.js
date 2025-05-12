import test from 'brittle'
import Check from '../src/utils/check.js';

test('preTx', function (t) {
    const check = new Check();
    const validData = {
        op: 'pre-tx',
        tx: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        is: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        wp: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        i: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        ipk: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        ch: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        in: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        bs: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        mbs: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'
    }
    const result = check.sanitizePreTx(validData)
    t.ok(result, 'Valid data should pass the sanitization')

})
