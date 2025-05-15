import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js'

const check = new Check()


test('sanitizeAdminAndWritersOperations – happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddAdmin,
        checkFixtures.validAddWriter,
        checkFixtures.validRemoveWriter
    ]

    for (const validInput of validInputs) {
        t.ok(check.sanitizeAdminAndWritersOperations(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('sanitizeAdminAndWritersOperations - data type validation TOP LEVEL', t => {
    const invalid = {
        ...checkFixtures.validAddWriter,
        extra: 'redundant field'
    };
    t.absent(check.sanitizeAdminAndWritersOperations(invalid), 'Extra field should fail due to $$strict');
    t.absent(check.sanitizeAdminAndWritersOperations({}), 'Empty object should fail');
    const invalidOperationType = { ...checkFixtures.validAddWriter, type: 'invalid-op' }
    t.absent(check.sanitizeAdminAndWritersOperations(invalidOperationType), 'Invalid operation type should fail');

    // testing for nested objects
    const neastedObjectInsideValue = {
        ...checkFixtures.validAddWriter,
        value: {
            ...checkFixtures.validAddWriter.value,
            nested: { foo: 'bar' }
        }
    };

    t.absent(check.sanitizeAdminAndWritersOperations(neastedObjectInsideValue), 'Unexpected nested field inside value should fail');

    const neastedObjectInsideValue2 = {
        ...checkFixtures.validAddWriter,
        nested: { foo: 'bar' }
    };
    t.absent(check.sanitizeAdminAndWritersOperations(neastedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const neastedObjectInsideValue3 = {
        ...checkFixtures.validAddWriter,
        type: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeAdminAndWritersOperations(neastedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const neastedObjectInsideValue4 = {
        ...checkFixtures.validAddWriter,
        key: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizeAdminAndWritersOperations(neastedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types
    const topFields = ['type', 'key', 'value'];

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, type: invalidType };
        t.absent(check.sanitizeAdminAndWritersOperations(invalidTypForTypeKey), `Invalid data type for 'type' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, key: invalidType };
        t.absent(check.sanitizeAdminAndWritersOperations(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidType) === '[object Object]') {
            continue;
        }
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, value: invalidType };
        t.absent(check.sanitizeAdminAndWritersOperations(invalidTypForTypeKey), `Invalid data type for 'value' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddWriter, type: 123 }
    t.absent(check.sanitizeAdminAndWritersOperations(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFields) {
        const missingFieldInvalidInput = { ...checkFixtures.validAddWriter }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.sanitizeAdminAndWritersOperations(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }
});

test('sanitizeAdminAndWritersOperations - data type validation VALUE LEVEL', t => {

    // missing value fields
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const missing = {
            ...checkFixtures.validAddWriter,
            value: { ...checkFixtures.validAddWriter.value }
        };
        delete missing.value[field];
        t.absent(check.sanitizeAdminAndWritersOperations(missing), `Missing value.${field} should fail`);
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
            t.absent(check.sanitizeAdminAndWritersOperations(withInvalidDataType), `Invalid data type for value.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
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
        t.absent(check.sanitizeAdminAndWritersOperations(emptyStr), `Empty string for value.${field} should fail`);
    }


    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddWriter,
            value: {
                ...checkFixtures.validAddWriter.value,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.sanitizeAdminAndWritersOperations(nestedObj), `Nested object for value.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddWriter,
        value: {
            ...checkFixtures.validAddWriter.value,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizeAdminAndWritersOperations(extraInValue), 'Extra field should fail due to $$strict')


    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddWriter,
            value: {
                ...checkFixtures.validAddWriter.value,
                [field]: {}
            }
        }
        t.absent(check.sanitizeAdminAndWritersOperations(emptyObjForField), `Empty object for value.${field} should fail`)
    }

});

test('sanitizeAdminAndWritersOperations - hexString length validation - TOP LEVEL', t => {
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

    t.absent(check.sanitizeAdminAndWritersOperations(inputs.shortInput), `'key' too short (length ${tooShort.length}) should fail`);

    t.absent(check.sanitizeAdminAndWritersOperations(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(check.sanitizeAdminAndWritersOperations(inputs.exactInput), `'key' exact length (length ${exact.length}) should pass`);

    t.absent(check.sanitizeAdminAndWritersOperations(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(check.sanitizeAdminAndWritersOperations(inputs.longInput), `'key' too long (length ${tooLong.length}) should fail`);
});

test('sanitizeAdminAndWritersOperations - hexString length validation - VALUE LEVEL', t => {

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

        t.absent(check.sanitizeAdminAndWritersOperations(inputs.shortInput), `value.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.sanitizeAdminAndWritersOperations(inputs.oneTooShortInput), `value.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.sanitizeAdminAndWritersOperations(inputs.exactInput), `value.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.sanitizeAdminAndWritersOperations(inputs.oneTooLongInput), `value.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.sanitizeAdminAndWritersOperations(inputs.longInput), `value.${field} too long (length ${tooLong.length}) should fail`);
    }
});

test('sanitizeAdminAndWritersOperations - reject non-hex characters TOP LEVEL', t => {
    const expectedLen = 64;
    const invalidKey = checkFixtures.validAddWriter.key.slice(0, expectedLen - 1) + 'z';

    const invalidInput = {
        ...checkFixtures.validAddWriter,
        key: invalidKey
    };
    t.absent(check.sanitizeAdminAndWritersOperations(invalidInput), `'key' with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
});

test('sanitizeAdminAndWritersOperations - reject non-hex characters VALUE LEVEL', t => {
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

        t.absent(check.sanitizeAdminAndWritersOperations(invalidInput), `value.${field} with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
    }

});