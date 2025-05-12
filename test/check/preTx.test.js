import test from 'brittle'
import fixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';

test('preTx', function (t) {
    const check = new Check();
    const result = check.sanitizePreTx(fixtures.validPreTx)
    t.ok(result, 'Valid data should pass the sanitization')

})

test('sanitizePreTx - extra field not allowed', t => {
    const check = new Check();
    const invalidInput = {
        ...fixtures.validPreTx,
        extra: 'redundant field'
      }
    
    t.absent(check.sanitizePreTx(invalidInput), 'Extra field should fail due to $$strict');
  });
