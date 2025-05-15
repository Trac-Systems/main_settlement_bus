import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js'

const check = new Check()

test('sanitizeExtendedKeyOpSchema – happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddAdmin,
        checkFixtures.validAddWriter,
        checkFixtures.validRemoveWriter
    ]

    for (const validInput of validInputs) {
        t.ok(check.sanitizeExtendedKeyOpSchema(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('sanitizeExtendedKeyOpSchema - data type validation TOP LEVEL', t => {
    const invalid = {
        ...checkFixtures.validAddWriter,
        extra: 'redundant field'
    };
    t.absent(check.sanitizeExtendedKeyOpSchema(invalid), 'Extra field should fail due to $$strict');
    t.absent(check.sanitizeExtendedKeyOpSchema({}), 'Empty object should fail');
    const invalidOperationType = { ...checkFixtures.validAddWriter, type: 'invalid-op' }
    t.absent(check.sanitizeExtendedKeyOpSchema(invalidOperationType), 'Invalid operation type should fail');

    // testing for nested objects
    const nestedObjectInsideValue = {
        ...checkFixtures.validAddWriter,
        value: {
            ...checkFixtures.validAddWriter.value,
            nested: { foo: 'bar' }
        }
    };

    t.absent(check.sanitizeExtendedKeyOpSchema(nestedObjectInsideValue), 'Unexpected nested field inside value should fail');

    const nestedObjectInsideValue2 = {
        ...checkFixtures.validAddWriter,
        nested: { foo: 'bar' }
    };
    t.absent(check.sanitizeExtendedKeyOpSchema(nestedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const nestedObjectInsideValue3 = {
        ...checkFixtures.validAddWriter,
        type: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeExtendedKeyOpSchema(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const nestedObjectInsideValue4 = {
        ...checkFixtures.validAddWriter,
        key: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeExtendedKeyOpSchema(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types
    const topFields = ['type', 'key', 'value'];

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, type: invalidType };
        t.absent(check.sanitizeExtendedKeyOpSchema(invalidTypForTypeKey), `Invalid data type for 'type' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, key: invalidType };
        t.absent(check.sanitizeExtendedKeyOpSchema(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidType) === '[object Object]') {
            continue;
        }
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, value: invalidType };
        t.absent(check.sanitizeExtendedKeyOpSchema(invalidTypForTypeKey), `Invalid data type for 'value' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddWriter, type: 123 }
    t.absent(check.sanitizeExtendedKeyOpSchema(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFields) {
        const missingFieldInvalidInput = { ...checkFixtures.validAddWriter }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.sanitizeExtendedKeyOpSchema(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }
});

test('sanitizeExtendedKeyOpSchema - data type validation VALUE LEVEL', t => {

    // missing value fields
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const missing = {
            ...checkFixtures.validAddWriter,
            value: { ...checkFixtures.validAddWriter.value }
        };
        delete missing.value[field];
        t.absent(check.sanitizeExtendedKeyOpSchema(missing), `Missing value.${field} should fail`);
    }

    // Incorrect types for each field in value
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        for (const invalidType of checkFixtures.notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validAddWriter,
                value: {
                    ...checkFixtures.validAddWriter.value,
                    [field]: invalidType
                }
            };
            t.absent(check.sanitizeExtendedKeyOpSchema(withInvalidDataType), `Invalid data type for value.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
        }
    }

    // Empty string for each field in value
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const emptyStr = {
            ...checkFixtures.validAddWriter,
            value: {
                ...checkFixtures.validAddWriter.value,
                [field]: ''
            }
        };
        t.absent(check.sanitizeExtendedKeyOpSchema(emptyStr), `Empty string for value.${field} should fail`);
    }

    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddWriter,
            value: {
                ...checkFixtures.validAddWriter.value,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.sanitizeExtendedKeyOpSchema(nestedObj), `Nested object for value.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddWriter,
        value: {
            ...checkFixtures.validAddWriter.value,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizeExtendedKeyOpSchema(extraInValue), 'Extra field should fail due to $$strict')

    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddWriter,
            value: {
                ...checkFixtures.validAddWriter.value,
                [field]: {}
            }
        }
        t.absent(check.sanitizeExtendedKeyOpSchema(emptyObjForField), `Empty object for value.${field} should fail`)
    }

});

test('sanitizeExtendedKeyOpSchema - hexString length validation - TOP LEVEL', t => {
    const expectedLen = 64;

    const oneTooShort = 'a'.repeat(expectedLen - 1);
    const tooShort = 'a'.repeat(expectedLen - 2);
    const exact = 'a'.repeat(expectedLen);
    const oneTooLong = 'a'.repeat(expectedLen + 1);
    const tooLong = 'a'.repeat(expectedLen + 2);

    const inputs = {
        shortInput: { ...checkFixtures.validAddWriter, key: tooShort },
        oneTooShortInput: { ...checkFixtures.validAddWriter, key: oneTooShort },
        exactInput: { ...checkFixtures.validAddWriter, key: exact },
        oneTooLongInput: { ...checkFixtures.validAddWriter, key: oneTooLong },
        longInput: { ...checkFixtures.validAddWriter, key: tooLong },
    };

    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.shortInput), `'key' too short (length ${tooShort.length}) should fail`);

    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(check.sanitizeExtendedKeyOpSchema(inputs.exactInput), `'key' exact length (length ${exact.length}) should pass`);

    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.longInput), `'key' too long (length ${tooLong.length}) should fail`);
});

test('sanitizeExtendedKeyOpSchema - hexString length validation - VALUE LEVEL', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForExtendedValue)) {
        const oneTooShort = 'a'.repeat(expectedLen - 1);
        const tooShort = 'a'.repeat(expectedLen - 2);
        const exact = 'a'.repeat(expectedLen);
        const oneTooLong = 'a'.repeat(expectedLen + 1);
        const tooLong = 'a'.repeat(expectedLen + 2);

        const buildValueLevel = (val) => ({
            ...checkFixtures.validAddWriter,
            value: {
                ...checkFixtures.validAddWriter.value,
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

        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.shortInput), `value.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooShortInput), `value.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.sanitizeExtendedKeyOpSchema(inputs.exactInput), `value.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooLongInput), `value.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.longInput), `value.${field} too long (length ${tooLong.length}) should fail`);
    }
});

test('sanitizeExtendedKeyOpSchema - reject non-hex characters TOP LEVEL', t => {
    const expectedLen = 64;
    const invalidKey = checkFixtures.validAddWriter.key.slice(0, expectedLen - 1) + 'z';

    const invalidInput = {
        ...checkFixtures.validAddWriter,
        key: invalidKey
    };
    t.absent(check.sanitizeExtendedKeyOpSchema(invalidInput), `'key' with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
});

test('sanitizeExtendedKeyOpSchema - reject non-hex characters VALUE LEVEL', t => {
    const buildValueLevel = (field, val) => ({
        ...checkFixtures.validAddWriter,
        value: {
            ...checkFixtures.validAddWriter.value,
            [field]: val
        }
    });

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForExtendedValue)) {
        const characterOutOfTheHex = checkFixtures.validAddWriter.value[field].slice(0, expectedLen - 1) + 'z';
        const invalidInput = buildValueLevel(field, characterOutOfTheHex);

        t.absent(check.sanitizeExtendedKeyOpSchema(invalidInput), `value.${field} with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
    }

});