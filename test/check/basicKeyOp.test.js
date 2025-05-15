import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';

const check = new Check();

test('sanitizeBasicKeyOp – happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddIndexer,
        checkFixtures.validRemoveIndexr,
        checkFixtures.validAppendWhitelist,
        checkFixtures.validBanValidator
    ]

    for (const validInput of validInputs) {
        t.ok(check.sanitizeBasicKeyOp(validInput), `Valid data for ${validInput.type} should pass the sanitization`)
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
    const neastedObjectInsideValue = {
        ...checkFixtures.validAddIndexer,
        value: {
            ...checkFixtures.validAddIndexer.value,
            nested: { foo: 'bar' }
        }
    };

    t.absent(check.sanitizeBasicKeyOp(neastedObjectInsideValue), 'Unexpected nested field inside value should fail');

    const neastedObjectInsideValue2 = {
        ...checkFixtures.validAddIndexer,
        nested: { foo: 'bar' }
    };
    t.absent(check.sanitizeBasicKeyOp(neastedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const neastedObjectInsideValue3 = {
        ...checkFixtures.validAddIndexer,
        type: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeBasicKeyOp(neastedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const neastedObjectInsideValue4 = {
        ...checkFixtures.validAddIndexer,
        key: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeBasicKeyOp(neastedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types
    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddIndexer, type: invalidType };
        t.absent(check.sanitizeBasicKeyOp(invalidTypForTypeKey), `Invalid data type for 'type' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddIndexer, key: invalidType };
        t.absent(check.sanitizeBasicKeyOp(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidType) === '[object Object]') {
            continue;
        }
        const invalidTypForTypeKey = { ...checkFixtures.validAddIndexer, value: invalidType };
        t.absent(check.sanitizeBasicKeyOp(invalidTypForTypeKey), `Invalid data type for 'value' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddIndexer, type: 123 }
    t.absent(check.sanitizeBasicKeyOp(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFields) {
        const missingFieldInvalidInput = { ...checkFixtures.validAddIndexer }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.sanitizeBasicKeyOp(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }
});

test('sanitizeBasicKeyOp - data type validation VALUE LEVEL', t => {

    // missing value fields
    for (const field of checkFixtures.basicKeyOpValueFields) {
        const missing = {
            ...checkFixtures.validAddIndexer,
            value: { ...checkFixtures.validAddIndexer.value }
        };
        delete missing.value[field];
        t.absent(check.sanitizeBasicKeyOp(missing), `Missing value.${field} should fail`);
    }

    // Incorrect types for each field in value
    for (const field of checkFixtures.basicKeyOpValueFields) {
        for (const invalidType of checkFixtures.notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validAddIndexer,
                value: {
                    ...checkFixtures.validAddIndexer.value,
                    [field]: invalidType
                }
            };
            t.absent(check.sanitizeBasicKeyOp(withInvalidDataType), `Invalid data type for value.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
        }
    }

    // Empty string for each field in value
    for (const field of checkFixtures.basicKeyOpValueFields) {
        const emptyStr = {
            ...checkFixtures.validAddIndexer,
            value: {
                ...checkFixtures.validAddIndexer.value,
                [field]: ''
            }
        };
        t.absent(check.sanitizeBasicKeyOp(emptyStr), `Empty string for value.${field} should fail`);
    }

    for (const field of checkFixtures.basicKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddIndexer,
            value: {
                ...checkFixtures.validAddIndexer.value,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.sanitizeBasicKeyOp(nestedObj), `Nested object for value.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddIndexer,
        value: {
            ...checkFixtures.validAddIndexer.value,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizeBasicKeyOp(extraInValue), 'Extra field should fail due to $$strict')


    for (const field of checkFixtures.basicKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddIndexer,
            value: {
                ...checkFixtures.validAddIndexer.value,
                [field]: {}
            }
        }
        t.absent(check.sanitizeBasicKeyOp(emptyObjForField), `Empty object for value.${field} should fail`)
    }

});

test('sanitizeBasicKeyOp - hexString length validation - TOP LEVEL', t => {
    const expectedLen = 64;

    const oneTooShort = 'a'.repeat(expectedLen - 1);
    const tooShort = 'a'.repeat(expectedLen - 2);
    const exact = 'a'.repeat(expectedLen);
    const oneTooLong = 'a'.repeat(expectedLen + 1);
    const tooLong = 'a'.repeat(expectedLen + 2);

    const inputs = {
        shortInput: { ...checkFixtures.validAddIndexer, key: tooShort },
        oneTooShortInput: { ...checkFixtures.validAddIndexer, key: oneTooShort },
        exactInput: { ...checkFixtures.validAddIndexer, key: exact },
        oneTooLongInput: { ...checkFixtures.validAddIndexer, key: oneTooLong },
        longInput: { ...checkFixtures.validAddIndexer, key: tooLong },
    };

    t.absent(check.sanitizeBasicKeyOp(inputs.shortInput), `'key' too short (length ${tooShort.length}) should fail`);

    t.absent(check.sanitizeBasicKeyOp(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(check.sanitizeBasicKeyOp(inputs.exactInput), `'key' exact length (length ${exact.length}) should pass`);

    t.absent(check.sanitizeBasicKeyOp(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(check.sanitizeBasicKeyOp(inputs.longInput), `'key' too long (length ${tooLong.length}) should fail`);
});

test('sanitizeBasicKeyOp - hexString length validation - VALUE LEVEL', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForBasicKeyOp)) {
        const oneTooShort = 'a'.repeat(expectedLen - 1);
        const tooShort = 'a'.repeat(expectedLen - 2);
        const exact = 'a'.repeat(expectedLen);
        const oneTooLong = 'a'.repeat(expectedLen + 1);
        const tooLong = 'a'.repeat(expectedLen + 2);

        const buildValueLevel = (val) => ({
            ...checkFixtures.validAddIndexer,
            value: {
                ...checkFixtures.validAddIndexer.value,
                [field]: val
            }
        });

        const inputs = {
            shortInput: buildValueLevel(tooShort),
            oneTooShortInput: buildValueLevel(oneTooShort),
            exactInput: buildValueLevel(exact),
            oneTooLongInput: buildValueLevel(oneTooLong),
            longInput: buildValueLevel(tooLong),
        };

        t.absent(check.sanitizeBasicKeyOp(inputs.shortInput), `value.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.sanitizeBasicKeyOp(inputs.oneTooShortInput), `value.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.sanitizeBasicKeyOp(inputs.exactInput), `value.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.sanitizeBasicKeyOp(inputs.oneTooLongInput), `value.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.sanitizeBasicKeyOp(inputs.longInput), `value.${field} too long (length ${tooLong.length}) should fail`);
    }
});

test('sanitizeBasicKeyOp - reject non-hex characters TOP LEVEL', t => {
    const expectedLen = 64;
    const invalidKey = checkFixtures.validAddIndexer.key.slice(0, expectedLen - 1) + 'z';

    const invalidInput = {
        ...checkFixtures.validAddIndexer,
        key: invalidKey
    };
    t.absent(check.sanitizeBasicKeyOp(invalidInput), `'key' with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
});

test('sanitizeBasicKeyOp - reject non-hex characters VALUE LEVEL', t => {
    const buildValueLevel = (field, val) => ({
        ...checkFixtures.validAddIndexer,
        value: {
            ...checkFixtures.validAddIndexer.value,
            [field]: val
        }
    });

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForBasicKeyOp)) {
        const characterOutOfTheHex = checkFixtures.validAddIndexer.value[field].slice(0, expectedLen - 1) + 'z';
        const invalidInput = buildValueLevel(field, characterOutOfTheHex);

        t.absent(check.sanitizeBasicKeyOp(invalidInput), `value.${field} with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
    }

});
