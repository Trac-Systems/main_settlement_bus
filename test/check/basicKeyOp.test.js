import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';
import b4a from 'b4a';
import { MIN_SAFE_VALIDATION_INTEGER, MAX_SAFE_VALIDATION_INTEGER } from '../../src/utils/constants.js';
import {TRAC_ADDRESS_SIZE} from 'trac-wallet/constants.js';

const check = new Check();

test('validateBasicKeyOp - happy paths for all operation types', t => {
    const validInputs = [
        checkFixtures.validAddIndexer,
        checkFixtures.validRemoveIndexer,
        checkFixtures.validAppendWhitelist,
        checkFixtures.validBanValidator
    ]

    for (const validInput of validInputs) {
        t.ok(check.validateBasicKeyOp(validInput), `Valid data for ${validInput.type} should pass the validation`)
    }
})

test('validateBasicKeyOp - data type validation TOP LEVEL', t => {
    // testing strict
    const invalidInput = {
        ...checkFixtures.validAddIndexer,
        extra: b4a.from('redundant field', 'utf-8')
    }
    t.absent(check.validateBasicKeyOp(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.validateBasicKeyOp({}), 'Empty object should fail');

    const invalidOperationType = { ...checkFixtures.validAddIndexer, type: 'invalid-op' }
    t.absent(check.validateBasicKeyOp(invalidOperationType), 'Invalid operation type should fail');

    const belowMin = { ...checkFixtures.validAddIndexer, type: MIN_SAFE_VALIDATION_INTEGER - 1 };
    const aboveMax = { ...checkFixtures.validAddIndexer, type: MAX_SAFE_VALIDATION_INTEGER + 1 };
    t.absent(check.validateBasicKeyOp(belowMin), 'Type below allowed min should fail');
    t.absent(check.validateBasicKeyOp(aboveMax), 'Type above allowed max should fail');

    // testing for nested objects
    const nestedObjectInsideValue = {
        ...checkFixtures.validAddIndexer,
        bko: {
            ...checkFixtures.validAddIndexer.bko,
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validateBasicKeyOp(nestedObjectInsideValue), 'Unexpected nested field inside `bko` should fail due to strict');

    const nestedObjectInsideValue2 = {
        ...checkFixtures.validAddIndexer,
        nested: { foo: b4a.from('bar', 'utf-8') }
    };
    t.absent(check.validateBasicKeyOp(nestedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const nestedObjectInsideValue3 = {
        ...checkFixtures.validAddIndexer,
        type: {
            foo: b4a.from('bar', 'utf-8'),
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validateBasicKeyOp(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const nestedObjectInsideValue4 = {
        ...checkFixtures.validAddIndexer,
        key: {
            foo: b4a.from('bar', 'utf-8'),
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validateBasicKeyOp(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types
    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForType = { ...checkFixtures.validAddIndexer, type: invalidDataType };
        if (typeof invalidDataType === 'number') {
            continue;
        }
        t.absent(check.validateBasicKeyOp(invalidDataTypeForType), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validAddIndexer, key: invalidDataType };
        t.absent(check.validateBasicKeyOp(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidDataType) === '[object Object]') {
            continue;
        }
        const invalidTypeForTypeValue = { ...checkFixtures.validAddIndexer, bko: invalidDataType };
        t.absent(check.validateBasicKeyOp(invalidTypeForTypeValue), `Invalid data type for 'bko' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validAddIndexer, type: "string" }
    t.absent(check.validateBasicKeyOp(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFieldsBko) {
        const missingFieldInvalidInput = { ...checkFixtures.validAddIndexer }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.validateBasicKeyOp(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }
});

test('validateBasicKeyOp - data type validation VALUE LEVEL (bko)', t => {

    // missing bko fields
    for (const field of checkFixtures.basicKeyOpValueFields) {
        const missing = {
            ...checkFixtures.validAddIndexer,
            bko: { ...checkFixtures.validAddIndexer.bko }
        };
        delete missing.bko[field];
        t.absent(check.validateBasicKeyOp(missing), `Missing bko.${field} should fail`);
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
            t.absent(check.validateBasicKeyOp(withInvalidDataType), `Invalid data type for bko.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
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
        t.absent(check.validateBasicKeyOp(emptyStr), `Empty string for bko.${field} should fail`);
    }

    for (const field of checkFixtures.basicKeyOpValueFields) {
        const nestedObj = {
            ...checkFixtures.validAddIndexer,
            bko: {
                ...checkFixtures.validAddIndexer.bko,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.validateBasicKeyOp(nestedObj), `Nested object for bko.${field} should fail under strict mode`);
    }

    const extraInValue = {
        ...checkFixtures.validAddIndexer,
        bko: {
            ...checkFixtures.validAddIndexer.bko,
            extraField: 'redundant'
        }
    }
    t.absent(check.validateBasicKeyOp(extraInValue), 'Extra field should fail due to $$strict')


    for (const field of checkFixtures.basicKeyOpValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validAddIndexer,
            bko: {
                ...checkFixtures.validAddIndexer.bko,
                [field]: {}
            }
        }
        t.absent(check.validateBasicKeyOp(emptyObjForField), `Empty object for bko.${field} should fail`)
    }

});

test('validateBasicKeyOp - buffer length validation - TOP LEVEL', t => {
    const expectedLen = TRAC_ADDRESS_SIZE;

    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
    const tooShort = b4a.alloc(expectedLen - 2, 0x01);
    const exact = b4a.alloc(expectedLen, 0x01);
    const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
    const tooLong = b4a.alloc(expectedLen + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...checkFixtures.validAddIndexer, address: emptyBuffer },
        shortInput: { ...checkFixtures.validAddIndexer, address: tooShort },
        oneTooShortInput: { ...checkFixtures.validAddIndexer, address: oneTooShort },
        exactInput: { ...checkFixtures.validAddIndexer, address: exact },
        oneTooLongInput: { ...checkFixtures.validAddIndexer, address: oneTooLong },
        longInput: { ...checkFixtures.validAddIndexer, address: tooLong },
    };

    t.absent(check.validateBasicKeyOp(inputs.emptyBufferInput), `'address' empty buffer (length ${emptyBuffer.length}) should fail`);

    t.absent(check.validateBasicKeyOp(inputs.shortInput), `'address' too short (length ${tooShort.length}) should fail`);

    t.absent(check.validateBasicKeyOp(inputs.oneTooShortInput), `'address' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(check.validateBasicKeyOp(inputs.exactInput), `'address' exact length (length ${exact.length}) should pass`);

    t.absent(check.validateBasicKeyOp(inputs.oneTooLongInput), `'address' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(check.validateBasicKeyOp(inputs.longInput), `'address' too long (length ${tooLong.length}) should fail`);
});

test('validateBasicKeyOp - hexString length validation - VALUE LEVEL (bko)', t => {

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
        t.absent(check.validateBasicKeyOp(inputs.emptyBufferInput), `bko.${field} empty buffer (length ${emptyBuffer.length}) should fail`);
        t.absent(check.validateBasicKeyOp(inputs.shortInput), `bko.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.validateBasicKeyOp(inputs.oneTooShortInput), `bko.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.validateBasicKeyOp(inputs.exactInput), `bko.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.validateBasicKeyOp(inputs.oneTooLongInput), `bko.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.validateBasicKeyOp(inputs.longInput), `bko.${field} too long (length ${tooLong.length}) should fail`);
    }
});
