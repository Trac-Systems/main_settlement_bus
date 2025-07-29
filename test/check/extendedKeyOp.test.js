import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js'
import b4a from 'b4a'
import { MIN_SAFE_VALIDATION_INTEGER, MAX_SAFE_VALIDATION_INTEGER } from '../../src/utils/constants.js';
import {TRAC_ADDRESS_SIZE} from 'trac-wallet/constants.js';
const check = new Check()

test('validateExtendedKeyOpSchema - happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddAdmin,
        checkFixtures.validAddWriter,
        checkFixtures.validRemoveWriter
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateExtendedKeyOpSchema(validInput), `Valid payload for ${validInput.type} should pass`)
    }
})

test('validateExtendedKeyOpSchema - data type validation TOP LEVEL', t => {
    // testing strict
    const invalidInput = {
        ...checkFixtures.validAddWriter,
        extra: b4a.from('redundant field', 'utf-8')
    }
    t.absent(check.validateExtendedKeyOpSchema(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.validateExtendedKeyOpSchema({}), 'Empty object should fail');

    const invalidOperationType = { ...checkFixtures.validAddWriter, type: 'invalid-op' }
    t.absent(check.validateExtendedKeyOpSchema(invalidOperationType), 'Invalid operation type should fail');

    const belowMin = { ...checkFixtures.validAddWriter, type: MIN_SAFE_VALIDATION_INTEGER - 1 };
    const aboveMax = { ...checkFixtures.validAddWriter, type: MAX_SAFE_VALIDATION_INTEGER + 1 };
    t.absent(check.validateExtendedKeyOpSchema(belowMin), 'Type below allowed min should fail');
    t.absent(check.validateExtendedKeyOpSchema(aboveMax), 'Type above allowed max should fail');

    // testing for nested objects
    const nestedObjectInsideValue = {
        ...checkFixtures.validAddWriter,
        eko: {
            ...checkFixtures.validAddWriter.eko,
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validateExtendedKeyOpSchema(nestedObjectInsideValue), 'Unexpected nested field inside `eko` should fail due to strict');

    const nestedObjectInsideValue2 = {
        ...checkFixtures.validAddWriter,
        nested: { foo: b4a.from('bar', 'utf-8') }
    };
    t.absent(check.validateExtendedKeyOpSchema(nestedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const nestedObjectInsideValue3 = {
        ...checkFixtures.validAddWriter,
        type: {
            foo: b4a.from('bar', 'utf-8'),
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validateExtendedKeyOpSchema(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const nestedObjectInsideValue4 = {
        ...checkFixtures.validAddWriter,
        key: {
            foo: b4a.from('bar', 'utf-8'),
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validateExtendedKeyOpSchema(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types
    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForType = { ...checkFixtures.validAddWriter, type: invalidDataType };
        if (typeof invalidDataType === 'number') {
            continue;
        }
        t.absent(check.validateExtendedKeyOpSchema(invalidDataTypeForType), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddWriter, key: invalidDataType };
        t.absent(check.validateExtendedKeyOpSchema(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidDataType) === '[object Object]') {
            continue;
        }
        const invalidTypeForTypeValue = { ...checkFixtures.validAddWriter, eko: invalidDataType };
        t.absent(check.validateExtendedKeyOpSchema(invalidTypeForTypeValue), `Invalid data type for 'eko' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddWriter, type: "string" }
    t.absent(check.validateExtendedKeyOpSchema(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFieldsEko) {
        const missingFieldInvalidInput = { ...checkFixtures.validAddWriter }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.validateExtendedKeyOpSchema(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }
});

test('validateExtendedKeyOpSchema - data type validation VALUE LEVEL (eko)', t => {

    // missing value fields
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const missing = {
            ...checkFixtures.validAddWriter,
            eko: { ...checkFixtures.validAddWriter.eko }
        };
        delete missing.eko[field];
        t.absent(check.validateExtendedKeyOpSchema(missing), `Missing eko.${field} should fail`);
    }

    // Incorrect types for each field in value (eko)
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        for (const invalidType of checkFixtures.notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validAddWriter,
                eko: {
                    ...checkFixtures.validAddWriter.eko,
                    [field]: invalidType
                }
            };
            t.absent(check.validateExtendedKeyOpSchema(withInvalidDataType), `Invalid data type for value.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
        }
    }

    // Empty string for each field in value
    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const emptyStr = {
            ...checkFixtures.validAddWriter,
            eko: {
                ...checkFixtures.validAddWriter.eko,
                [field]: ''
            }
        };
        t.absent(check.validateExtendedKeyOpSchema(emptyStr), `Empty string for eko.${field} should fail`);
    }

    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddWriter,
            eko: {
                ...checkFixtures.validAddWriter.eko,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.validateExtendedKeyOpSchema(nestedObj), `Nested object for eko.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddWriter,
        eko: {
            ...checkFixtures.validAddWriter.eko,
            extraField: 'redundant'
        }
    }
    t.absent(check.validateExtendedKeyOpSchema(extraInValue), 'Extra field should fail due to $$strict')

    for (const field of checkFixtures.extendedKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddWriter,
            eko: {
                ...checkFixtures.validAddWriter.eko,
                [field]: {}
            }
        }
        t.absent(check.validateExtendedKeyOpSchema(emptyObjForField), `Empty object for eko.${field} should fail`)
    }

});

test('sanitizeExtendedKeyOpSchema - buffer length validation - TOP LEVEL', t => {
    const expectedLen = TRAC_ADDRESS_SIZE;

    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
    const tooShort = b4a.alloc(expectedLen - 2, 0x01);
    const exact = b4a.alloc(expectedLen, 0x01);
    const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
    const tooLong = b4a.alloc(expectedLen + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...checkFixtures.validAddWriter, address: emptyBuffer },
        shortInput: { ...checkFixtures.validAddWriter, address: tooShort },
        oneTooShortInput: { ...checkFixtures.validAddWriter, address: oneTooShort },
        exactInput: { ...checkFixtures.validAddWriter, address: exact },
        oneTooLongInput: { ...checkFixtures.validAddWriter, address: oneTooLong },
        longInput: { ...checkFixtures.validAddWriter, address: tooLong },
    };

    t.absent(check.validateExtendedKeyOpSchema(inputs.emptyBufferInput), `'key' empty buffer (length ${emptyBuffer.length}) should fail`);
    
    t.absent(check.validateExtendedKeyOpSchema(inputs.shortInput), `'key' too short (length ${tooShort.length}, non-zero) should fail`);
    t.absent(check.validateExtendedKeyOpSchema(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}, non-zero) should fail`);

    t.ok(check.validateExtendedKeyOpSchema(inputs.exactInput), `'key' exact length (length ${exact.length}, non-zero) should pass`);

    t.absent(check.validateExtendedKeyOpSchema(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}, non-zero) should fail`);
    t.absent(check.validateExtendedKeyOpSchema(inputs.longInput), `'key' too long (length ${tooLong.length}, non-zero) should fail`);
});

test('sanitizeExtendedKeyOpSchema - buffer length validation - VALUE LEVEL (eko)', t => {

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

        t.absent(check.validateExtendedKeyOpSchema(inputs.emptyBufferInput), `eko.${field} empty buffer (length ${emptyBuffer.length}) should fail`);

        t.absent(check.validateExtendedKeyOpSchema(inputs.shortInput), `eko.${field} too short (length ${tooShort.length}, non-zero) should fail`);

        t.absent(check.validateExtendedKeyOpSchema(inputs.oneTooShortInput), `eko.${field} one too short (length ${oneTooShort.length}, non-zero) should fail`);

        t.ok(check.validateExtendedKeyOpSchema(inputs.exactInput), `eko.${field} exact length (length ${exact.length}, non-zero) should pass`);

        t.absent(check.validateExtendedKeyOpSchema(inputs.oneTooLongInput), `eko.${field} one too long (length ${oneTooLong.length}, non-zero) should fail`);
        
        t.absent(check.validateExtendedKeyOpSchema(inputs.longInput), `eko.${field} too long (length ${tooLong.length}, non-zero) should fail`);
    }
});
