import test from 'brittle'
import checkFixtures from '../fixtures/check.fixtures.js'
import Check from '../../src/utils/check.js';

const check = new Check();

test('sanitzatePostTx - happy-path case', t => {
    const result = check.sanitizePostTx(checkFixtures.validPostTx)
    t.ok(result, 'Valid data should pass the sanitization')
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
    const neastedObjectInsideValue = {
        ...checkFixtures.validPostTx,
        value: {
            ...checkFixtures.validPostTx.value,
            nested: { foo: 'bar' }
        }
    };

    t.absent(check.sanitizePostTx(neastedObjectInsideValue), 'Unexpected nested field inside value should fail due to $$strict');

    const neastedObjectInsideValue2 = {
        ...checkFixtures.validPostTx,
        nested: { foo: 'bar' }
    };

    t.absent(check.sanitizePostTx(neastedObjectInsideValue2), 'Unexpected nested field inside object should fail due to $$strict');
    const neastedObjectInsideValue3 = {
        ...checkFixtures.validPostTx,
        type: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizePostTx(neastedObjectInsideValue3), 'Unexpected nested field inside `type` field should fail due to $$strict');

    const neastedObjectInsideValue4 = {
        ...checkFixtures.validPostTx,
        key: {
            foo: 'bar',
            nested: { foo: 'bar' }
        }
    };
    t.absent(check.sanitizePostTx(neastedObjectInsideValue4), 'Unexpected nested field inside `key` field should fail due to $$strict');

    //testing for invalid data types
    const postTxMainfields = ['type', 'key', 'value'];
    const notAllowedDataTypes = [
        997,
        true,
        null,
        undefined,
        {},
        [],
        () => { },
        //Symbol('sym'), test will throw but protocol won't accept it TODO: fix in the future
        BigInt(997),
        new Date(),
        NaN,
        new Map(),
        new Set()
    ]

    for (const invalidType of notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validPostTx, type: invalidType };
        t.absent(check.sanitizePostTx(invalidTypForTypeKey), `Invalid data type for 'type' key ${String(invalidType)} (${typeof invalidType}) should fail`);

    }

    for (const invalidType of notAllowedDataTypes) {
        const invalidTypForTypeKey = { ...checkFixtures.validPostTx, key: invalidType };
        t.absent(check.sanitizePostTx(invalidTypForTypeKey), `Invalid data type for 'key' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    for (const invalidType of notAllowedDataTypes) {
        if (String(invalidType) === '[object Object]') {
            continue;
        }
        const invalidTypForTypeKey = { ...checkFixtures.validPostTx, value: invalidType };
        t.absent(check.sanitizePostTx(invalidTypForTypeKey), `Invalid data type for 'value' key ${String(invalidType)} (${typeof invalidType}) should fail`);
    }

    const invalidOperationTypeDiffType = { ...checkFixtures.validPostTx, type: 123 }
    t.absent(check.sanitizePostTx(invalidOperationTypeDiffType), 'Wrong type for `type` should fail')

    for (const mainField of postTxMainfields) {
        const missingFieldInvalidInput = { ...checkFixtures.validPostTx }
        delete missingFieldInvalidInput[mainField]
        t.absent(check.sanitizePostTx(missingFieldInvalidInput), `Missing ${mainField} should fail`);
    }

});

test('sanitizePostTx - data type validation VALUE LEVEL', t => {
    const postTxValueFields = ['op', 'tx', 'is', 'w', 'i', 'ipk', 'ch', 'in', 'bs', 'mbs', 'ws', 'wp', 'wn'];
    const notAllowedDataTypes = [
        997,
        true,
        null,
        undefined,
        {},
        [],
        () => { },
        //Symbol('sym'), test will throw but protocol won't accept it TODO: fix in the future
        BigInt(997),
        new Date(),
        NaN,
        new Map(),
        new Set()
    ]
    // missing value fields
    for (const field of postTxValueFields) {
        const missing = {
            ...checkFixtures.validPostTx,
            value: { ...checkFixtures.validPostTx.value }
        };
        delete missing.value[field];
        t.absent(check.sanitizePostTx(missing), `Missing value.${field} should fail`);
    }
    // Incorrect types for each field in value
    for (const field of postTxValueFields) {
        for (const invalidType of notAllowedDataTypes) {
            const withInvalidDataType = {
                ...checkFixtures.validPostTx,
                value: {
                    ...checkFixtures.validPostTx.value,
                    [field]: invalidType
                }
            };
            t.absent(check.sanitizePostTx(withInvalidDataType), `Invalid data type for value.${field}: ${String(invalidType)} (${typeof invalidType}) should fail`);
        }
    }
    // Empty string for each field in value
    for (const field of postTxValueFields) {
        const emptyStr = {
            ...checkFixtures.validPostTx,
            value: {
                ...checkFixtures.validPostTx.value,
                [field]: ''
            }
        };
        t.absent(check.sanitizePostTx(emptyStr), `Empty string for value.${field} should fail`);
    }

    for (const field of postTxValueFields) {
        const nestedObj = {
            ...checkFixtures.validPostTx,
            value: {
                ...checkFixtures.validPostTx.value,
                [field]: { foo: 'bar' }
            }
        };

        t.absent(
            check.sanitizePostTx(nestedObj),
            `Nested object for value.${field} should fail under strict mode`
        );
    }

    const incorrectOpAsString = {
        ...checkFixtures.validPostTx,
        value: {
            ...checkFixtures.validPostTx.value,
            op: 'test'
        }
    };
    t.absent(check.sanitizePostTx(incorrectOpAsString), `Invalid enum for value.op ('foo') should fail`);

    const extraInValue = {
        ...checkFixtures.validPostTx,
        value: {
            ...checkFixtures.validPostTx.value,
            extraField: 'redundant'
        }
    }
    t.absent(check.sanitizePostTx(extraInValue), 'Extra field should fail due to $$strict')


    for (const field of postTxValueFields) {
        const emptyObjForField = {
            ...checkFixtures.validPostTx,
            value: {
                ...checkFixtures.validPostTx.value,
                [field]: {}
            }
        }
        t.absent(check.sanitizePostTx(emptyObjForField), `Empty object for value.${field} should fail`)
    }

});



test('sanitizePostTx - hexString length validation - TOP LEVEL', t => {
    const expectedLen = 64;

    const oneTooShort = 'a'.repeat(expectedLen - 1);
    const tooShort = 'a'.repeat(expectedLen - 2);
    const exact = 'a'.repeat(expectedLen);
    const oneTooLong = 'a'.repeat(expectedLen + 1);
    const tooLong = 'a'.repeat(expectedLen + 2);

    const inputs = {
        shortInput: { ...checkFixtures.validPostTx, key: tooShort },
        oneTooShortInput: { ...checkFixtures.validPostTx, key: oneTooShort },
        exactInput: { ...checkFixtures.validPostTx, key: exact },
        oneTooLongInput: { ...checkFixtures.validPostTx, key: oneTooLong },
        longInput: { ...checkFixtures.validPostTx, key: tooLong },
    };

    t.absent(check.sanitizePostTx(inputs.shortInput), `'key' too short (length ${tooShort.length}) should fail`);

    t.absent(check.sanitizePostTx(inputs.oneTooShortInput), `'key' one too short (length ${oneTooShort.length}) should fail`);

    t.ok(check.sanitizePostTx(inputs.exactInput), `'key' exact length (length ${exact.length}) should pass`);

    t.absent(check.sanitizePostTx(inputs.oneTooLongInput), `'key' one too long (length ${oneTooLong.length}) should fail`);

    t.absent(check.sanitizePostTx(inputs.longInput), `'key' too long (length ${tooLong.length}) should fail`);
});



test('sanitizePostTx - hexString length validation - VALUE LEVEL', t => {
    const requiredLengthOfFields = {
        tx: 64,
        is: 128,
        w: 64,
        i: 64,
        ipk: 64,
        ch: 64,
        in: 64,
        bs: 64,
        mbs: 64,
        ws: 128,
        wp: 64,
        wn: 64,
    };

    for (const [field, expectedLen] of Object.entries(requiredLengthOfFields)) {
        const oneTooShort = 'a'.repeat(expectedLen - 1);
        const tooShort = 'a'.repeat(expectedLen - 2);
        const exact = 'a'.repeat(expectedLen);
        const oneTooLong = 'a'.repeat(expectedLen + 1);
        const tooLong = 'a'.repeat(expectedLen + 2);

        const buildValueLevel = (val) => ({
            ...checkFixtures.validPostTx,
            value: {
                ...checkFixtures.validPostTx.value,
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

        t.absent(check.sanitizePostTx(inputs.shortInput), `value.${field} too short (length ${tooShort.length}) should fail`);
        t.absent(check.sanitizePostTx(inputs.oneTooShortInput), `value.${field} one too short (length ${oneTooShort.length}) should fail`);
        t.ok(check.sanitizePostTx(inputs.exactInput), `value.${field} exact length (length ${exact.length}) should pass`);
        t.absent(check.sanitizePostTx(inputs.oneTooLongInput), `value.${field} one too long (length ${oneTooLong.length}) should fail`);
        t.absent(check.sanitizePostTx(inputs.longInput), `value.${field} too long (length ${tooLong.length}) should fail`);
    }
});


test('sanitizePostTx - reject non-hex characters TOP LEVEL', t => {
    const expectedLen = 64;
    const invalidKey = checkFixtures.validPostTx.key.slice(0, expectedLen - 1) + 'z';

    const invalidInput = {
        ...checkFixtures.validPostTx,
        key: invalidKey
    };
    t.absent(check.sanitizePreTx(invalidInput), `'key' with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
});

test('sanitizePostTx - reject non-hex characters VALUE LEVEL', t => {
    const requiredLengthOfFields = {
        tx: 64,
        is: 128,
        w: 64,
        i: 64,
        ipk: 64,
        ch: 64,
        in: 64,
        bs: 64,
        mbs: 64,
        ws: 128,
        wp: 64,
        wn: 64,
    };
    const buildValueLevel = (field, val) => ({
        ...checkFixtures.validPostTx,
        value: {
          ...checkFixtures.validPostTx.value,
          [field]: val
        }
      });
    
    for (const [field, expectedLen] of Object.entries(requiredLengthOfFields)) {
        const characterOutOfTheHex = checkFixtures.validPostTx.value[field].slice(0, expectedLen - 1) + 'z';
        const invalidInput = buildValueLevel(field, characterOutOfTheHex);

        t.absent(check.sanitizePostTx(invalidInput),`value.${field} with non-hex char should fail (last char replaced with 'z') where expected length is ${expectedLen}`);
    }

});



