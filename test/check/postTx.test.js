import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';
import b4a from 'b4a';
import { MIN_SAFE_VALIDATION_INTEGER, MAX_SAFE_VALIDATION_INTEGER } from '../../src/utils/constants.js';
import {TRAC_ADDRESS_SIZE} from 'trac-wallet/constants.js';
const check = new Check();

test('validatePostTx - happy-path case', t => {
    console.log(checkFixtures.validPostTx)
    const result = check.validatePostTx(checkFixtures.validPostTx)
    t.ok(result, 'Valid data should pass the validation')
})

test('validatePostTx - data type validation TOP LEVEL', t => {
    //testing strict
    const invalidInput = {
        ...checkFixtures.validPostTx,
        extra: b4a.from('redundant field', 'utf-8')
    }

    t.absent(check.validatePostTx(invalidInput), 'Extra field should fail due to $$strict');
    t.absent(check.validatePostTx({}), 'Empty object should fail');

    const invalidOperationType = { ...checkFixtures.validPostTx, type: 'invalid-op' }
    t.absent(check.validatePostTx(invalidOperationType), 'Invalid operation type should fail');

    const belowMin = { ...checkFixtures.validPostTx, type: MIN_SAFE_VALIDATION_INTEGER - 1 };
    const aboveMax = { ...checkFixtures.validPostTx, type: MAX_SAFE_VALIDATION_INTEGER + 1 };
    t.absent(check.validatePostTx(belowMin), 'Type below allowed min should fail');
    t.absent(check.validatePostTx(aboveMax), 'Type above allowed max should fail');

    // testing for nested objects
    const nestedObjectInsideValue = {
        ...checkFixtures.validPostTx,
        txo: {
            ...checkFixtures.validPostTx.txo,
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validatePostTx(nestedObjectInsideValue), 'Unexpected nested field inside `txo` should fail due to strict');

    const nestedObjectInsideValue2 = {
        ...checkFixtures.validPostTx,
        nested: { foo: b4a.from('bar', 'utf-8') }
    };

    t.absent(check.validatePostTx(nestedObjectInsideValue2), 'Unexpected nested field inside object should fail due to strict');

    const nestedObjectInsideValue3 = {
        ...checkFixtures.validPostTx,
        type: {
            foo: b4a.from('bar', 'utf-8'),
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validatePostTx(nestedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to strict');

    const nestedObjectInsideValue4 = {
        ...checkFixtures.validPostTx,
        key: {
            foo: b4a.from('bar', 'utf-8'),
            nested: { foo: b4a.from('bar', 'utf-8') }
        }
    };
    t.absent(check.validatePostTx(nestedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to strict');

    //testing for invalid data types

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidDataTypeForType = { ...checkFixtures.validPostTx, type: invalidDataType };
        if (typeof invalidDataType === 'number') {
            continue;
        }
        t.absent(check.validatePostTx(invalidDataTypeForType), `Invalid data type for 'type' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validPostTx, key: invalidDataType };
        t.absent(check.validatePostTx(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    for (const invalidDataType of checkFixtures.notAllowedDataTypes) {
        if (String(invalidDataType) === '[object Object]') {
            continue;
        }
        const invalidTypeForTypeValue = { ...checkFixtures.validPostTx, txo: invalidDataType };
        t.absent(check.validatePostTx(invalidTypeForTypeValue), `Invalid data type for 'txo' key ${String(invalidDataType)} (${typeof invalidDataType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validPostTx, type: "string" }
    t.absent(check.validatePostTx(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of checkFixtures.topFieldsTx) {
        const missingFieldInvalidInput = { ...checkFixtures.validPostTx }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.validatePostTx(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }

});

test('validatePostTx - data type validation VALUE LEVEL (txo)', t => {

    // missing value fields
    for (const field of checkFixtures.postTxValueFields) {
        const missing = {
            ...checkFixtures.validPostTx,
            txo: { ...checkFixtures.validPostTx.txo }
        };
        delete missing.txo[field];
        t.absent(check.validatePostTx(missing), `Missing txo.${field} should fail`);
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
            t.absent(check.validatePostTx(withInvalidDataType), `Invalid data type for txo.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
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
        t.absent(check.validatePostTx(emptyStr), `Empty string for txo.${field} should fail`);
    }

    for (const field of checkFixtures.postTxValueFields) {
        const nestedObj = {
            ...checkFixtures.validPostTx,
            txo: {
                ...checkFixtures.validPostTx.txo,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(check.validatePostTx(nestedObj), `Nested object for txo.${field} should fail under strict mode`);
    }

    const incorrectOpAsString = {
        ...checkFixtures.validPostTx,
        txo: {
            ...checkFixtures.validPostTx.txo,
            op: 'test'
        }
    };
    t.absent(check.validatePostTx(incorrectOpAsString), `Invalid enum for txo.op ('foo') should fail`);

    const extraInValue = {
        ...checkFixtures.validPostTx,
        txo: {
            ...checkFixtures.validPostTx.txo,
            extraField: 'redundant'
        }
    };
    t.absent(check.validatePostTx(extraInValue), 'Extra field should fail due to $$strict');

    for (const field of checkFixtures.postTxValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validPostTx,
            txo: {
                ...checkFixtures.validPostTx.txo,
                [field]: {}
            }
        }
        t.absent(check.validatePostTx(emptyObjForField), `Empty object for txo.${field} should fail`)
    }

});

test('validatePostTx - Buffer length validation - TOP LEVEL', t => {
    const expectedLen = TRAC_ADDRESS_SIZE;

    const emptyBuffer = b4a.alloc(0);
    const oneTooShort = b4a.alloc(expectedLen - 1, 0x01);
    const tooShort = b4a.alloc(expectedLen - 2, 0x01);
    const exact = b4a.alloc(expectedLen, 0x01);
    const oneTooLong = b4a.alloc(expectedLen + 1, 0x01);
    const tooLong = b4a.alloc(expectedLen + 2, 0x01);

    const inputs = {
        emptyBufferInput: { ...checkFixtures.validPostTx, address: emptyBuffer },
        shortInput: { ...checkFixtures.validPostTx, address: tooShort },
        oneTooShortInput: { ...checkFixtures.validPostTx, address: oneTooShort },
        exactInput: { ...checkFixtures.validPostTx, address: exact },
        oneTooLongInput: { ...checkFixtures.validPostTx, address: oneTooLong },
        longInput: { ...checkFixtures.validPostTx, address: tooLong },
    };

    t.absent(check.validatePostTx(inputs.emptyBufferInput), `'address' empty buffer (length ${emptyBuffer.length}) should fail`);
    t.absent(check.validatePostTx(inputs.shortInput), `'address' too short (length ${tooShort.length}) should fail`);
    t.absent(check.validatePostTx(inputs.oneTooShortInput), `'address' one too short (length ${oneTooShort.length}) should fail`);
    t.ok(check.validatePostTx(inputs.exactInput), `'address' exact length (length ${exact.length}) should pass`);
    t.absent(check.validatePostTx(inputs.oneTooLongInput), `'address' one too long (length ${oneTooLong.length}) should fail`);
    t.absent(check.validatePostTx(inputs.longInput), `'address' too long (length ${tooLong.length}) should fail`);
});

test('validatePostTx - Buffer length validation - VALUE LEVEL (txo)', t => {

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

        t.absent(check.validatePostTx(inputs.emptyBufferInput), `txo.${field} empty buffer (length ${emptyBuffer.length}) should fail`);
        t.absent(check.validatePostTx(inputs.shortInput), `txo.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.validatePostTx(inputs.oneTooShortInput), `txo.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.validatePostTx(inputs.exactInput), `txo.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.validatePostTx(inputs.oneTooLongInput), `txo.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.validatePostTx(inputs.longInput), `txo.${field} too long (length ${tooLong.length}) should fail`);
    }
});


