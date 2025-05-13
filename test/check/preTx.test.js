import test from 'brittle'
import fixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';

const check = new Check();

test('preTx', t => {
    const result = check.sanitizePreTx(fixtures.validPreTx)
    t.ok(result, 'Valid data should pass the sanitization')

})

test('sanitizePreTx - data type validation', t => {
    const invalidInput = {
        ...fixtures.validPreTx,
        extra: 'redundant field'
    }

    t.absent(check.sanitizePreTx(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.sanitizePreTx({}), 'Empty object should fail');

    const preTxfields = ['op', 'tx', 'is', 'wp', 'i', 'ipk', 'ch', 'in', 'bs', 'mbs']

    const dataTypes = [
        997,
        true,
        null,
        undefined,
        {},
        [],
        () => { },
        //Symbol('sym'), test will throw but protocol won't accept it TODO: fix in the future
        BigInt(997),
        new Date(),
        NaN
    ]

    for (const field of preTxfields) {
        const missingFieldInvalidInput = { ...fixtures.validPreTx }
        delete missingFieldInvalidInput[field]
        t.absent(check.sanitizePreTx(missingFieldInvalidInput), `Missing ${field} should fail`);
    }

    for (const field of preTxfields) {
        for (const dataType of dataTypes) {
            const input = { ...fixtures.validPreTx, [field]: dataType }
            t.absent(check.sanitizePreTx(input), `${field} as ${typeof dataType} should fail`)
        }
    }

    const invalidOperationType = { ...fixtures.validPreTx, op: 'invalid-op' }
    t.absent(check.sanitizePreTx(invalidOperationType), 'Invalid operation type should fail');
    
    const invalidOperationTypeDiffType = { ...fixtures.validPreTx, op: 123 }
    t.absent(check.sanitizePreTx(invalidOperationTypeDiffType), 'Wrong type for op should fail')

    const neastedInvalidInput = { ...fixtures.validPreTx, nested: { foo: 'bar' } }
    t.absent(check.sanitizePreTx(neastedInvalidInput), 'Nested object should fail under strict mode')

    for (const dataType of dataTypes) {
        t.absent(check.sanitizePreTx(dataType), `${typeof dataType} should fail`)
    }
});


test('sanitizePreTx - hexString length validation', t => {
    const requiredLengthOfFields = {
        tx: 64,     // (uncomment when you enforce tx length)
        is: 128,
        wp: 64,
        i: 64,
        ipk: 64,
        ch: 64,     // (uncomment when you enforce ch length)
        in: 64,
        bs: 64,
        mbs: 64
      }
    
      for (const [field, expectedLen] of Object.entries(requiredLengthOfFields)) {
        const tooShort = 'a'.repeat(expectedLen - 2)
        const tooLong  = 'a'.repeat(expectedLen + 2)
        const exact    = 'a'.repeat(expectedLen);
        const shortInput = { ...fixtures.validPreTx, [field]: tooShort }
        const longInput  = { ...fixtures.validPreTx, [field]: tooLong }
        const exactInput = { ...fixtures.validPreTx, [field]: exact }

        t.absent(
          check.sanitizePreTx(shortInput),
          `${field} too short (length ${tooShort.length}) should fail`
        )
    
        t.absent(
          check.sanitizePreTx(longInput),
          `${field} too long (length ${tooLong.length}) should fail`
        )

        t.ok(
            check.sanitizePreTx(exactInput),
            `${field} is ok (length ${exact.length}) should pass`
          )
      }
}); 
