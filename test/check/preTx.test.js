import test from 'brittle'

import Check from '../../src/utils/check.js';
import { PRETX, notAllowedDataTypes } from '../fixtures/check.fixtures.js';

const check = new Check();

test('validatePreTx - happy-path case', t => {
    const result = check.validatePreTx(PRETX.validPreTx)
    t.ok(result, 'Valid data should pass the validation')
})

test('validatePreTx - data type validation', t => {
    const invalidInput = {
        ...PRETX.validPreTx,
        extra: 'redundant field'
    }

    t.absent(check.validatePreTx(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.validatePreTx({}), 'Empty object should fail');

    for (const field of PRETX.preTxfields) {
        const missingFieldInvalidInput = { ...PRETX.validPreTx }
        delete missingFieldInvalidInput[field]
        t.absent(check.validatePreTx(missingFieldInvalidInput), `Missing ${field} should fail`);
    }

    for (const field of PRETX.preTxfields) {
        for (const dataType of notAllowedDataTypes) {
            const input = { ...PRETX.validPreTx, [field]: dataType }
            t.absent(check.validatePreTx(input), `${field} as ${typeof dataType}(${String(dataType)}) should fail`)
        }
    }

    const invalidOperationType = { ...PRETX.validPreTx, op: 'invalid-op' }
    t.absent(check.validatePreTx(invalidOperationType), 'Invalid operation type should fail');

    const invalidOperationTypeDiffType = { ...PRETX.validPreTx, op: 123 }
    t.absent(check.validatePreTx(invalidOperationTypeDiffType), 'Wrong type for op should fail')

    const neastedInvalidInput = { ...PRETX.validPreTx, nested: { foo: 'bar' } }
    t.absent(check.validatePreTx(neastedInvalidInput), 'Nested object should fail under strict mode')

    for (const dataType of notAllowedDataTypes) {
        t.absent(check.validatePreTx(dataType), `${typeof dataType} should fail`)
    }
});

test('validatePreTx - hexString length validation', t => {

    for (const [field, expectedLen] of Object.entries(PRETX.requiredLengthOfFieldsForPreTx)) {
        const tooShort = 'a'.repeat(expectedLen - 2)
        const oneTooShort = 'a'.repeat(expectedLen - 1)
        const exact = 'a'.repeat(expectedLen)
        const oneTooLong = 'a'.repeat(expectedLen + 1)
        const tooLong = 'a'.repeat(expectedLen + 2)

        const shortInput = { ...PRETX.validPreTx, [field]: tooShort }
        const oneTooShortInput = { ...PRETX.validPreTx, [field]: oneTooShort }
        const exactInput = { ...PRETX.validPreTx, [field]: exact }
        const oneTooLongInput = { ...PRETX.validPreTx, [field]: oneTooLong }
        const longInput = { ...PRETX.validPreTx, [field]: tooLong }

        t.absent(check.validatePreTx(shortInput), `${field} too short (length ${tooShort.length}) should fail`)
        t.absent(check.validatePreTx(oneTooShortInput), `${field} one too short (length ${oneTooShort.length}) should fail`)
        t.ok(check.validatePreTx(exactInput), `${field} is ok (length ${exact.length}) should pass`)
        t.absent(check.validatePreTx(oneTooLongInput), `${field} one too long (length ${oneTooLong.length}) should fail`)
        t.absent(check.validatePreTx(longInput), `${field} too long (length ${tooLong.length}) should fail`)
    }
});

test('validatePreTx - reject non-hex characters in any field', t => {
    
    for (const [field, expectedLen] of Object.entries(PRETX.requiredLengthOfFieldsForPreTx)) {
        if (field === 'ia' || field === 'va') continue; // exception is ia and va, because "z" is included in the alphabet
        const characterOutOfTheHex = PRETX.validPreTx[field].slice(0, expectedLen - 1) + 'z';
        const input = { ...PRETX.validPreTx, [field]: characterOutOfTheHex };

        t.absent(check.validatePreTx(input), `${field} with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
    }

});