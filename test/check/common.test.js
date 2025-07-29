import b4a from 'b4a';
import { MIN_SAFE_VALIDATION_INTEGER, MAX_SAFE_VALIDATION_INTEGER } from '../../src/utils/constants.js';
import { TRAC_ADDRESS_SIZE } from 'trac-wallet/constants.js';

export function topLevelValidationTests(
    t,
    validateFn,
    validFixture,
    valueKey, // 'bko', 'txo', 'eko'
    notAllowedDataTypes,
    topFields
) {

    t.test('strict mode', t => {
        const invalidInput = {
            ...validFixture,
            extra: b4a.from('redundant field', 'utf-8')
        };
        t.absent(validateFn(invalidInput), 'Extra field should fail due to $$strict');
        t.absent(validateFn({}), 'Empty object should fail');
    });

    t.test('operation type', t => {
        const invalidOperationType = { ...validFixture, type: 'invalid-op' };
        t.absent(validateFn(invalidOperationType), 'Invalid operation type should fail');
    });

    t.test('type range', t => {
        const belowMin = { ...validFixture, type: MIN_SAFE_VALIDATION_INTEGER - 1 };
        const aboveMax = { ...validFixture, type: MAX_SAFE_VALIDATION_INTEGER + 1 };
        t.absent(validateFn(belowMin), 'Type below allowed min should fail');
        t.absent(validateFn(aboveMax), 'Type above allowed max should fail');
    });

    t.test('neasted objects', t => {
        const nestedObjectInsideValue = {
            ...validFixture,
            [valueKey]: {
                ...validFixture[valueKey],
                nested: { foo: b4a.from('bar', 'utf-8') }
            }
        };
        //console.log('nestedObjectInsideValue', nestedObjectInsideValue);
        t.absent(validateFn(nestedObjectInsideValue), `Unexpected nested field inside -${valueKey}- should fail due to strict`);
        const nestedObjectInsideValue2 = {
            ...validFixture,
            nested: { foo: b4a.from('bar', 'utf-8') }
        };
        //console.log('nestedObjectInsideValue2', nestedObjectInsideValue2);
        t.absent(validateFn(nestedObjectInsideValue2), 'Unexpected nested field inside general object should fail due to strict');

        const nestedObjectInsideValue3 = {
            ...validFixture,
            type: {
                foo: b4a.from('bar', 'utf-8'),
                nested: { foo: b4a.from('bar', 'utf-8') }
            }
        };
        //console.log('nestedObjectInsideValue3', nestedObjectInsideValue3);
        t.absent(validateFn(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

        const nestedObjectInsideValue4 = {
            ...validFixture,
            address: {
                foo: b4a.from('bar', 'utf-8'),
                nested: { foo: b4a.from('bar', 'utf-8') }
            }
        };
        //console.log('nestedObjectInsideValue4', nestedObjectInsideValue4);
        t.absent(validateFn(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');


    });

    t.test('invalid data types', t => {
        for (const invalidDataType of notAllowedDataTypes) {
            const invalidDataTypeForType = { ...validFixture, type: invalidDataType };
            if (typeof invalidDataType === 'number') {
                continue;
            }
            //console.log('invalidDataTypeForType', invalidDataTypeForType);
            t.absent(validateFn(invalidDataTypeForType), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
        }

        // testing for invalid data types in address
        for (const invalidDataType of notAllowedDataTypes) {
            const invalidTypForAddressKey = { ...validFixture, address: invalidDataType };
            //console.log('invalidTypForAddressKey', invalidTypForAddressKey);
            t.absent(validateFn(invalidTypForAddressKey), `Invalid data type for 'address' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
        }

        for (const invalidDataType of notAllowedDataTypes) {
            if (String(invalidDataType) === '[object Object]') {
                continue;
            }
            const invalidTypeForTypeValue = { ...validFixture, [valueKey]: invalidDataType };
            //console.log('invalidTypeForTypeValue', invalidTypeForTypeValue);
            t.absent(validateFn(invalidTypeForTypeValue), `Invalid data type for ${valueKey} key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
        }

        const invalidOperationTypeDiffType = { ...validFixture, type: "string" }
        //console.log('invalidOperationTypeDiffType', invalidOperationTypeDiffType);
        t.absent(validateFn(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

        for (const mainField of topFields) {
            const missingFieldInvalidInput = { ...validFixture }
            delete missingFieldInvalidInput[mainField]
            //console.log('missingFieldInvalidInput1111', missingFieldInvalidInput);
            t.absent(validateFn(missingFieldInvalidInput), `Missing ${mainField} should fail`);
        }
    });
}

export function valueLevelValidationTest(
    t,
    validateFn,
    validFixture,
    valueKey, // 'bko', 'txo', 'eko'
    operationTypeFields,
    notAllowedDataTypes,
) {
    t.test("missing value fields", t => {
        for (const field of operationTypeFields) {
            const missing = {
                ...validFixture,
                [valueKey]: { ...validFixture[valueKey] }
            };
            delete missing[valueKey][field];
            //console.log('missing', missing);
            t.absent(validateFn(missing), `Missing ${valueKey}.${field} should fail`);
        }
    });

    t.test(`Invalid data types for each field in ${valueKey}`, t => {
        for (const field of operationTypeFields) {
            for (const invalidType of notAllowedDataTypes) {
                const withInvalidDataType = {
                    ...validFixture,
                    [valueKey]: {
                        ...validFixture[valueKey],
                        [field]: invalidType
                    }
                };
                //console.log('withInvalidDataType', withInvalidDataType);
                t.absent(validateFn(withInvalidDataType), `Invalid data type for ${valueKey}.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
            }
        }
    });

    t.test("Empty strings for each field in value", t => {
        for (const field of operationTypeFields) {
            const emptyStr = {
                ...validFixture,
                [valueKey]: {
                    ...validFixture[valueKey],
                    [field]: ''
                }
            };
            //console.log('emptyStr', emptyStr);
            t.absent(validateFn(emptyStr), `Empty string for ${valueKey}.${field} should fail`);
        }
    })

    t.test("Nested objects for each field in value", t => {
        for (const field of operationTypeFields) {
            const nestedObj = {
                ...validFixture,
                [valueKey]: {
                    ...validFixture[valueKey],
                    [field]: { foo: b4a.from('bar', 'utf-8') }
                }
            };
            //console.log('nestedObj', nestedObj);
            t.absent(validateFn(nestedObj), `Nested object for ${valueKey}.${field} should fail under strict mode`);
        }
    });

    t.test("Extra field in value", t => {
        const extraInValue = {
            ...validFixture,
            [valueKey]: {
                ...validFixture[valueKey],
                extraField: b4a.from('redundant', 'utf-8')
            }
        }
        //console.log('extraInValue', extraInValue);
        t.absent(validateFn(extraInValue), 'Extra field should fail due to $$strict')
    });

    t.test("Empty object for each field in value", t => {
        for (const field of operationTypeFields) {
            const emptyObjForField = {
                ...validFixture,
                [valueKey]: {
                    ...validFixture[valueKey],
                    [field]: {}
                }
            }
            //console.log('emptyObjForField', emptyObjForField);
            t.absent(validateFn(emptyObjForField), `Empty object for ${valueKey}.${field} should fail`)
        }
    })

}

export function addressBufferLengthTest(
    t,
    validateFn,
    validFixture,
) {
    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(TRAC_ADDRESS_SIZE - 1, 0x01);
    const tooShort = b4a.alloc(TRAC_ADDRESS_SIZE - 2, 0x01);
    const exact = b4a.alloc(TRAC_ADDRESS_SIZE, 0x01);
    const oneTooLong = b4a.alloc(TRAC_ADDRESS_SIZE + 1, 0x01);
    const tooLong = b4a.alloc(TRAC_ADDRESS_SIZE + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...validFixture, address: emptyBuffer },
        shortInput: { ...validFixture, address: tooShort },
        oneTooShortInput: { ...validFixture, address: oneTooShort },
        exactInput: { ...validFixture, address: exact },
        oneTooLongInput: { ...validFixture, address: oneTooLong },
        longInput: { ...validFixture, address: tooLong },
    };

    t.absent(validateFn(inputs.emptyBufferInput), `'address' empty buffer (length ${emptyBuffer.length}) should fail`);

    t.absent(validateFn(inputs.shortInput), `'address' too short (length ${tooShort.length}) should fail`);

    t.absent(validateFn(inputs.oneTooShortInput), `'address' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(validateFn(inputs.exactInput), `'address' exact length (length ${exact.length}) should pass`);

    t.absent(validateFn(inputs.oneTooLongInput), `'address' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(validateFn(inputs.longInput), `'address' too long (length ${tooLong.length}) should fail`);
}

export function fieldsBufferLengthTest(
    t,
    validateFn,
    validFixture,
    valueKey, // 'bko', 'txo', 'eko'
    requiredFieldLengthsForValue
) {
    for (const [field, expectedLen] of Object.entries(requiredFieldLengthsForValue)) {
        const emptyBuffer = b4a.alloc(0);
        const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
        const tooShort = b4a.alloc(expectedLen - 2, 0x01);
        const exact = b4a.alloc(expectedLen, 0x01);
        const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
        const tooLong = b4a.alloc(expectedLen + 2, 0x01);

        const buildValueLevel = (val) => ({
            ...validFixture,
            [valueKey]: {
                ...validFixture[valueKey],
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

        t.absent(validateFn(inputs.emptyBufferInput), `${valueKey}.${field} empty buffer (length ${emptyBuffer.length}) should fail`);

        t.absent(validateFn(inputs.shortInput), `${valueKey}.${field} too short (length ${tooShort.length}) should fail`);

        t.absent(validateFn(inputs.oneTooShortInput), `${valueKey}.${field} one too short (length ${oneTooShort.length}) should fail`);

        t.ok(validateFn(inputs.exactInput), `${valueKey}.${field} exact length (length ${exact.length}) should pass`);

        t.absent(validateFn(inputs.oneTooLongInput), `${valueKey}.${field} one too long (length ${oneTooLong.length}) should fail`);

        t.absent(validateFn(inputs.longInput), `${valueKey}.${field} too long (length ${tooLong.length}) should fail`);
    }
}