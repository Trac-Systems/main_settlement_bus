import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';

const check = new Check();

test('sanitizePreTx - happy-path case', t => {
    const result = check.sanitizePreTx(checkFixtures.validPreTx)
    t.ok(result, 'Valid data should pass the sanitization')
})

test('sanitizePreTx - data type validation', t => {
    const invalidInput = {
        ...checkFixtures.validPreTx,
        extra: 'redundant field'
    }

    t.absent(check.sanitizePreTx(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.sanitizePreTx({}), 'Empty object should fail');

    for (const field of checkFixtures.preTxfields) {
        const missingFieldInvalidInput = { ...checkFixtures.validPreTx }
        delete missingFieldInvalidInput[field]
        t.absent(check.sanitizePreTx(missingFieldInvalidInput), `Missing ${field} should fail`);
    }

    for (const field of checkFixtures.preTxfields) {
        for (const dataType of checkFixtures.notAllowedDataTypes) {
            const input = { ...checkFixtures.validPreTx, [field]: dataType }
            t.absent(check.sanitizePreTx(input), `${field} as ${typeof dataType}(${String(dataType)}) should fail`)
        }
    }

    const invalidOperationType = { ...checkFixtures.validPreTx, op: 'invalid-op' }
    t.absent(check.sanitizePreTx(invalidOperationType), 'Invalid operation type should fail');

    const invalidOperationTypeDiffType = { ...checkFixtures.validPreTx, op: 123 }
    t.absent(check.sanitizePreTx(invalidOperationTypeDiffType), 'Wrong type for op should fail')

    const neastedInvalidInput = { ...checkFixtures.validPreTx, nested: { foo: 'bar' } }
    t.absent(check.sanitizePreTx(neastedInvalidInput), 'Nested object should fail under strict mode')

    for (const dataType of checkFixtures.notAllowedDataTypes) {
        t.absent(check.sanitizePreTx(dataType), `${typeof dataType} should fail`)
    }
});

test('sanitizePreTx - hexString length validation', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForPreTx)) {
        const tooShort = 'a'.repeat(expectedLen - 2)
        const oneTooShort = 'a'.repeat(expectedLen - 1)
        const exact = 'a'.repeat(expectedLen)
        const oneTooLong = 'a'.repeat(expectedLen + 1)
        const tooLong = 'a'.repeat(expectedLen + 2)

        const shortInput = { ...checkFixtures.validPreTx, [field]: tooShort }
        const oneTooShortInput = { ...checkFixtures.validPreTx, [field]: oneTooShort }
        const exactInput = { ...checkFixtures.validPreTx, [field]: exact }
        const oneTooLongInput = { ...checkFixtures.validPreTx, [field]: oneTooLong }
        const longInput = { ...checkFixtures.validPreTx, [field]: tooLong }

        t.absent(check.sanitizePreTx(shortInput), `${field} too short (length ${tooShort.length}) should fail`)
        t.absent(check.sanitizePreTx(oneTooShortInput), `${field} one too short (length ${oneTooShort.length}) should fail`)
        t.ok(check.sanitizePreTx(exactInput), `${field} is ok (length ${exact.length}) should pass`)
        t.absent(check.sanitizePreTx(oneTooLongInput), `${field} one too long (length ${oneTooLong.length}) should fail`)
        t.absent(check.sanitizePreTx(longInput), `${field} too long (length ${tooLong.length}) should fail`)
    }
});

test('sanitizePreTx - reject non-hex characters in any field', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForPreTx)) {
        const characterOutOfTheHex = checkFixtures.validPreTx[field].slice(0, expectedLen - 1) + 'z';
        const input = { ...checkFixtures.validPreTx, [field]: characterOutOfTheHex };

        t.absent(check.sanitizePreTx(input), `${field} with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
    }

});
