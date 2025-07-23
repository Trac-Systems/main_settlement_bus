import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';
import b4a from 'b4a';

const check = new Check();

test('sanitizePostTx - happy-path case', t => {
    console.log(checkFixtures.validPostTx)
    const result = check.sanitizePostTx(checkFixtures.validPostTx)
    t.ok(result, 'Valid data should pass the validation')
})

test('sanitizePostTx - data type validation TOP LEVEL', t => {
    //testing strict
    const invalidInput = {
        ...checkFixtures.validPostTx,
        extra: 'redundant field'
    }

    t.absent(check.sanitizePostTx(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.sanitizePostTx({}), 'Empty object should fail');

    const invalidOperationType = { ...checkFixtures.validPostTx, type: 'invalid-op' }
    t.absent(check.sanitizePostTx(invalidOperationType), 'Invalid operation type should fail');

    // testing for nested objects
    const nestedObjectInsideValue = {
        ...checkFixtures.validPostTx,
        txo: {
            ...checkFixtures.validPostTx.txo,
            nested: { foo: 'bar' }
        }
    };

    t.absent(check.sanitizePostTx(nestedObjectInsideValue), 'Unexpected nested field inside `txo` should fail due to strict');

    const nestedObjectInsideValue2 = {
        ...checkFixtures.validPostTx,
        nested: { foo: 'bar' }
    };

    t.absent(check.sanitizePostTx(nestedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');
    const nestedObjectInsideValue3 = {
        ...checkFixtures.validPostTx,
        type: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizePostTx(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const nestedObjectInsideValue4 = {
        ...checkFixtures.validPostTx,
        key: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizePostTx(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForType = { ...checkFixtures.validPostTx, type: invalidDataType };
        if (typeof invalidDataType === 'number') {
            continue;
        }
        t.absent(check.sanitizePostTx(invalidDataTypeForType), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validPostTx, key: invalidDataType };
        t.absent(check.sanitizePostTx(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidDataType) === '[object Object]') {
            continue;
        }
        const invalidTypeForTypeValue = { ...checkFixtures.validPostTx, txo: invalidDataType };
        t.absent(check.sanitizePostTx(invalidTypeForTypeValue), `Invalid data type for 'txo' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validPostTx, type: "string" }
    t.absent(check.sanitizePostTx(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFieldsTx) {
        const missingFieldInvalidInput = { ...checkFixtures.validPostTx }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.sanitizePostTx(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }

});

test('sanitizePostTx - data type validation VALUE LEVEL (txo)', t => {

    // missing value fields
    for (const field of checkFixtures.postTxValueFields) {
        const missing = {
            ...checkFixtures.validPostTx,
            txo: { ...checkFixtures.validPostTx.txo }
        };
        delete missing.txo[field];
        t.absent(check.sanitizePostTx(missing), `Missing txo.${field} should fail`);
    }

    // Incorrect types for each field in value
    for (const field of checkFixtures.postTxValueFields) {
        for (const invalidType of checkFixtures.notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validPostTx,
                txo: {
                    ...checkFixtures.validPostTx.txo,
                    [field]: invalidType
                }
            };
            t.absent(check.sanitizePostTx(withInvalidDataType), `Invalid data type for txo.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
        }
    }

    // Empty string for each field in value
    for (const field of checkFixtures.postTxValueFields) {
        const emptyStr = {
            ...checkFixtures.validPostTx,
            txo: {
                ...checkFixtures.validPostTx.txo,
                [field]: ''
            }
        };
        t.absent(check.sanitizePostTx(emptyStr), `Empty string for txo.${field} should fail`);
    }

    for (const field of checkFixtures.postTxValueFields) {
        const nestedObj = {
            ...checkFixtures.validPostTx,
            txo: {
                ...checkFixtures.validPostTx.txo,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.sanitizePostTx(nestedObj), `Nested object for txo.${field} should fail under strict mode`);
    }

    const incorrectOpAsString = {
        ...checkFixtures.validPostTx,
        txo: {
            ...checkFixtures.validPostTx.txo,
            op: 'test'
        }
    };
    t.absent(check.sanitizePostTx(incorrectOpAsString), `Invalid enum for txo.op ('foo') should fail`);

    const extraInValue = {
        ...checkFixtures.validPostTx,
        txo: {
            ...checkFixtures.validPostTx.txo,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizePostTx(extraInValue), 'Extra field should fail due to $$strict')

    for (const field of checkFixtures.postTxValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validPostTx,
            txo: {
                ...checkFixtures.validPostTx.txo,
                [field]: {}
            }
        }
        t.absent(check.sanitizePostTx(emptyObjForField), `Empty object for txo.${field} should fail`)
    }

});

test('sanitizePostTx - Buffer length validation - TOP LEVEL', t => {
    const expectedLen = 32;

    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
    const tooShort = b4a.alloc(expectedLen - 2, 0x01);
    const exact = b4a.alloc(expectedLen, 0x01);
    const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
    const tooLong = b4a.alloc(expectedLen + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...checkFixtures.validPostTx, key: emptyBuffer },
        shortInput: { ...checkFixtures.validPostTx, key: tooShort },
        oneTooShortInput: { ...checkFixtures.validPostTx, key: oneTooShort },
        exactInput: { ...checkFixtures.validPostTx, key: exact },
        oneTooLongInput: { ...checkFixtures.validPostTx, key: oneTooLong },
        longInput: { ...checkFixtures.validPostTx, key: tooLong },
    };

    t.absent(check.sanitizePostTx(inputs.emptyBufferInput), `'key' empty buffer (length ${emptyBuffer.length}) should fail`);
    t.absent(check.sanitizePostTx(inputs.shortInput), `'key' too short (length ${tooShort.length}) should fail`);
    t.absent(check.sanitizePostTx(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}) should fail`);
    t.ok(check.sanitizePostTx(inputs.exactInput), `'key' exact length (length ${exact.length}) should pass`);
    t.absent(check.sanitizePostTx(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}) should fail`);
    t.absent(check.sanitizePostTx(inputs.longInput), `'key' too long (length ${tooLong.length}) should fail`);
});

test('sanitizePostTx - Buffer length validation - VALUE LEVEL (txo)', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForPostTx)) {
        const emptyBuffer = b4a.alloc(0);
        const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
        const tooShort = b4a.alloc(expectedLen - 2, 0x01);
        const exact = b4a.alloc(expectedLen, 0x01);
        const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
        const tooLong = b4a.alloc(expectedLen + 2, 0x01);

        const buildValueLevel = (val) => ({
            ...checkFixtures.validPostTx,
            txo: {
                ...checkFixtures.validPostTx.txo,
                [field]: val
            }
        });

        const inputs = {
            emptyBufferInput: buildValueLevel(emptyBuffer),
            shortInput: buildValueLevel(tooShort),
            oneTooShortInput: buildValueLevel(oneTooShort),
            exactInput: buildValueLevel(exact),
            oneTooLongInput: buildValueLevel(oneTooLong),
            longInput: buildValueLevel(tooLong),
        };

        t.absent(check.sanitizePostTx(inputs.emptyBufferInput), `txo.${field} empty buffer (length ${emptyBuffer.length}) should fail`);
        t.absent(check.sanitizePostTx(inputs.shortInput), `txo.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.sanitizePostTx(inputs.oneTooShortInput), `txo.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.sanitizePostTx(inputs.exactInput), `txo.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.sanitizePostTx(inputs.oneTooLongInput), `txo.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.sanitizePostTx(inputs.longInput), `txo.${field} too long (length ${tooLong.length}) should fail`);
    }
});


