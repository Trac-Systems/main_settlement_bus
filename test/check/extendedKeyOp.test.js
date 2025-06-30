import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js'
import b4a from 'b4a'
const check = new Check()

test('sanitizeExtendedKeyOpSchema - happy paths for all operation types', t => {
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
        eko: {
            ...checkFixtures.validAddWriter.eko,
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

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForTypeValue = { ...checkFixtures.validAddWriter, type: invalidDataType };
        if ( typeof invalidDataTypeForTypeValue.type === 'number') {
            continue;
        }
        t.absent(check.sanitizeExtendedKeyOpSchema(invalidDataTypeForTypeValue), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForKeyValue = { ...checkFixtures.validAddWriter, key: invalidDataType };
        t.absent(check.sanitizeExtendedKeyOpSchema(invalidDataTypeForKeyValue), `Invalid data type for 'key' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidDataType) === '[object Object]') {
            continue;
        }
        const invalidTypeForEkoValue = { ...checkFixtures.validAddWriter, eko: invalidDataType };
        t.absent(check.sanitizeExtendedKeyOpSchema(invalidTypeForEkoValue), `Invalid data type for 'eko' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddWriter, type: 'string' }
    t.absent(check.sanitizeExtendedKeyOpSchema(invalidOperationTypeDiffType), 'Incorrect data type for `type` should fail')

    for (const mainField of checkFixtures.topFieldsEko) {
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
            eko: { ...checkFixtures.validAddWriter.eko }
        };
        delete missing.eko[field];
        t.absent(check.sanitizeExtendedKeyOpSchema(missing), `Missing value.${field} should fail`);
    }

    // Incorrect types for each field in value
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        for (const invalidType of checkFixtures.notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validAddWriter,
                eko: {
                    ...checkFixtures.validAddWriter.eko,
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
            eko: {
                ...checkFixtures.validAddWriter.value,
                [field]: ''
            }
        };
        t.absent(check.sanitizeExtendedKeyOpSchema(emptyStr), `Empty string for value.${field} should fail`);
    }

    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddWriter,
            eko: {
                ...checkFixtures.validAddWriter.value,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.sanitizeExtendedKeyOpSchema(nestedObj), `Nested object for value.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddWriter,
        eko: {
            ...checkFixtures.validAddWriter.eko,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizeExtendedKeyOpSchema(extraInValue), 'Extra field should fail due to $$strict')

    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddWriter,
            eko: {
                ...checkFixtures.validAddWriter.eko,
                [field]: {}
            }
        }
        t.absent(check.sanitizeExtendedKeyOpSchema(emptyObjForField), `Empty object for value.${field} should fail`)
    }

});

test('sanitizeExtendedKeyOpSchema - buffer length validation - TOP LEVEL', t => {
    const expectedLen = 32;

    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
    const tooShort = b4a.alloc(expectedLen - 2, 0x01);
    const exact = b4a.alloc(expectedLen, 0x01);
    const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
    const tooLong = b4a.alloc(expectedLen + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...checkFixtures.validAddWriter, key: emptyBuffer },
        shortInput: { ...checkFixtures.validAddWriter, key: tooShort },
        oneTooShortInput: { ...checkFixtures.validAddWriter, key: oneTooShort },
        exactInput: { ...checkFixtures.validAddWriter, key: exact },
        oneTooLongInput: { ...checkFixtures.validAddWriter, key: oneTooLong },
        longInput: { ...checkFixtures.validAddWriter, key: tooLong },
    };

    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.emptyBufferInput), `'key' empty buffer (length ${emptyBuffer.length}) should fail`);
    
    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.shortInput), `'key' too short (length ${tooShort.length}, non-zero) should fail`);
    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}, non-zero) should fail`);

    t.ok(check.sanitizeExtendedKeyOpSchema(inputs.exactInput), `'key' exact length (length ${exact.length}, non-zero) should pass`);

    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}, non-zero) should fail`);
    t.absent(check.sanitizeExtendedKeyOpSchema(inputs.longInput), `'key' too long (length ${tooLong.length}, non-zero) should fail`);
});

test('sanitizeExtendedKeyOpSchema - buffer length validation - VALUE LEVEL', t => {

    for (const [field, expectedLen] of Object.entries(checkFixtures.requiredLengthOfFieldsForExtendedValue)) {
        const emptyBuffer = b4a.alloc(0);
        const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
        const tooShort = b4a.alloc(expectedLen - 2, 0x01);
        const exact = b4a.alloc(expectedLen, 0x01);
        const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
        const tooLong = b4a.alloc(expectedLen + 2, 0x01);

        const buildValueLevel = (val) => ({
            ...checkFixtures.validAddWriter,
            eko: {
                ...checkFixtures.validAddWriter.eko,
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

        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.emptyBufferInput), `value.${field} empty buffer (length ${emptyBuffer.length}) should fail`);

        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.shortInput), `value.${field} too short (length ${tooShort.length}, non-zero) should fail`);

        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooShortInput), `value.${field} one too short (length ${oneTooShort.length}, non-zero) should fail`);

        t.ok(check.sanitizeExtendedKeyOpSchema(inputs.exactInput), `value.${field} exact length (length ${exact.length}, non-zero) should pass`);

        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.oneTooLongInput), `value.${field} one too long (length ${oneTooLong.length}, non-zero) should fail`);
        
        t.absent(check.sanitizeExtendedKeyOpSchema(inputs.longInput), `value.${field} too long (length ${tooLong.length}, non-zero) should fail`);
    }
});
