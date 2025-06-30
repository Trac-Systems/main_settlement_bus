import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';
import b4a from 'b4a';
const check = new Check();

test('sanitizeBasicKeyOp – happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddIndexer,
        checkFixtures.validRemoveIndexer,
        checkFixtures.validAppendWhitelist,
        checkFixtures.validBanValidator
    ]

    for (const validInput of validInputs) {
        t.ok(check.sanitizeBasicKeyOp(validInput), `Valid data for ${validInput.type} should pass the validation`)
    }
})

test('sanitizeBasicKeyOp - data type validation TOP LEVEL', t => {
    const invalid = {
        ...checkFixtures.validAddIndexer,
        extra: 'redundant field'
    };
    t.absent(check.sanitizeBasicKeyOp(invalid), 'Extra field should fail due to $$strict');
    t.absent(check.sanitizeBasicKeyOp({}), 'Empty object should fail');
    const invalidOperationType = { ...checkFixtures.validAddIndexer, type: 'invalid-op' }
    t.absent(check.sanitizeBasicKeyOp(invalidOperationType), 'Invalid operation type should fail');

    // testing for nested objects
    const nestedObjectInsideValue = {
        ...checkFixtures.validAddIndexer,
        bko: {
            ...checkFixtures.validAddIndexer.bko,
            nested: { foo: 'bar' }
        }
    };

    t.absent(check.sanitizeBasicKeyOp(nestedObjectInsideValue), 'Unexpected nested field inside bko should fail');

    const nestedObjectInsideValue2 = {
        ...checkFixtures.validAddIndexer,
        nested: { foo: 'bar' }
    };
    t.absent(check.sanitizeBasicKeyOp(nestedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const nestedObjectInsideValue3 = {
        ...checkFixtures.validAddIndexer,
        type: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeBasicKeyOp(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const nestedObjectInsideValue4 = {
        ...checkFixtures.validAddIndexer,
        key: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeBasicKeyOp(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types
    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForTypeValue = { ...checkFixtures.validAddIndexer, type: invalidDataType };
        if (typeof invalidDataTypeForTypeValue.type === 'number') {
            continue;
        }
        t.absent(check.sanitizeBasicKeyOp(invalidDataTypeForTypeValue), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForTypeValue = { ...checkFixtures.validAddIndexer, key: invalidDataType };
        t.absent(check.sanitizeBasicKeyOp(invalidDataTypeForTypeValue), `Invalid data type for 'key' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidDataType) === '[object Object]') {
            continue;
        }
        const invalidDataTypeForTypeValue = { ...checkFixtures.validAddIndexer, bko: invalidDataType };
        t.absent(check.sanitizeBasicKeyOp(invalidDataTypeForTypeValue), `Invalid data type for 'bko' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddIndexer, type: "string" }
    t.absent(check.sanitizeBasicKeyOp(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFieldsBko) {
        const missingFieldInvalidInput = { ...checkFixtures.validAddIndexer }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.sanitizeBasicKeyOp(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }
});

test('sanitizeBasicKeyOp - data type validation VALUE LEVEL (bko)', t => {

    // missing bko fields
    for (const field of checkFixtures.basicKeyOpValueFields) {
        const missing = {
            ...checkFixtures.validAddIndexer,
            bko: { ...checkFixtures.validAddIndexer.bko }
        };
        delete missing.bko[field];
        t.absent(check.sanitizeBasicKeyOp(missing), `Missing bko.${field} should fail`);
    }

    // Incorrect types for each field in bko
    for (const field of checkFixtures.basicKeyOpValueFields) {
        for (const invalidType of checkFixtures.notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validAddIndexer,
                bko: {
                    ...checkFixtures.validAddIndexer.bko,
                    [field]: invalidType
                }
            };
            t.absent(check.sanitizeBasicKeyOp(withInvalidDataType), `Invalid data type for bko.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
        }
    }

    // Empty string for each field in value
    for (const field of checkFixtures.basicKeyOpValueFields) {
        const emptyStr = {
            ...checkFixtures.validAddIndexer,
            bko: {
                ...checkFixtures.validAddIndexer.bko,
                [field]: ''
            }
        };
        t.absent(check.sanitizeBasicKeyOp(emptyStr), `Empty string for bko.${field} should fail`);
    }

    for (const field of checkFixtures.basicKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddIndexer,
            bko: {
                ...checkFixtures.validAddIndexer.bko,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.sanitizeBasicKeyOp(nestedObj), `Nested object for bko.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddIndexer,
        bko: {
            ...checkFixtures.validAddIndexer.bko,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizeBasicKeyOp(extraInValue), 'Extra field should fail due to $$strict')


    for (const field of checkFixtures.basicKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddIndexer,
            bko: {
                ...checkFixtures.validAddIndexer.bko,
                [field]: {}
            }
        }
        t.absent(check.sanitizeBasicKeyOp(emptyObjForField), `Empty object for bko.${field} should fail`)
    }

});

test('sanitizeBasicKeyOp - buffer length validation - TOP LEVEL', t => {
    const expectedLen = 32;

    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
    const tooShort = b4a.alloc(expectedLen - 2, 0x01);
    const exact = b4a.alloc(expectedLen, 0x01);
    const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
    const tooLong = b4a.alloc(expectedLen + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...checkFixtures.validAddIndexer, key: emptyBuffer },
        shortInput: { ...checkFixtures.validAddIndexer, key: tooShort },
        oneTooShortInput: { ...checkFixtures.validAddIndexer, key: oneTooShort },
        exactInput: { ...checkFixtures.validAddIndexer, key: exact },
        oneTooLongInput: { ...checkFixtures.validAddIndexer, key: oneTooLong },
        longInput: { ...checkFixtures.validAddIndexer, key: tooLong },
    };

    t.absent(check.sanitizeBasicKeyOp(inputs.emptyBufferInput), `'key' empty buffer (length ${emptyBuffer.length}) should fail`);

    t.absent(check.sanitizeBasicKeyOp(inputs.shortInput), `'key' too short (length ${tooShort.length}) should fail`);

    t.absent(check.sanitizeBasicKeyOp(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(check.sanitizeBasicKeyOp(inputs.exactInput), `'key' exact length (length ${exact.length}) should pass`);

    t.absent(check.sanitizeBasicKeyOp(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(check.sanitizeBasicKeyOp(inputs.longInput), `'key' too long (length ${tooLong.length}) should fail`);
});

test('sanitizeBasicKeyOp - hexString length validation - VALUE LEVEL (bko)', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForBasicKeyOp)) {
        const emptyBuffer = b4a.alloc(0);
        const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
        const tooShort = b4a.alloc(expectedLen - 2, 0x01);
        const exact = b4a.alloc(expectedLen, 0x01);
        const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
        const tooLong = b4a.alloc(expectedLen + 2, 0x01);

        const buildValueLevel = (val) => ({
            ...checkFixtures.validAddIndexer,
            bko: {
                ...checkFixtures.validAddIndexer.bko,
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
        t.absent(check.sanitizeBasicKeyOp(inputs.emptyBufferInput), `bko.${field} empty buffer (length ${emptyBuffer.length}) should fail`);
        t.absent(check.sanitizeBasicKeyOp(inputs.shortInput), `bko.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.sanitizeBasicKeyOp(inputs.oneTooShortInput), `bko.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.sanitizeBasicKeyOp(inputs.exactInput), `bko.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.sanitizeBasicKeyOp(inputs.oneTooLongInput), `bko.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.sanitizeBasicKeyOp(inputs.longInput), `bko.${field} too long (length ${tooLong.length}) should fail`);
    }
});
