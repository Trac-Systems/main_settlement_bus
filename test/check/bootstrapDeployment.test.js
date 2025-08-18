import test from 'brittle'
import b4a from "b4a";
import Check from '../../src/utils/check.js';
import {BSD, notAllowedDataTypes} from '../fixtures/check.fixtures.js';
import {OperationType} from "../../src/utils/constants.js";
import {addressToBuffer} from "../../src/core/state/utils/address.js";
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';

const check = new Check();

test('validateBootstrapDeployment - happy-path case', t => {
    const test = {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: addressToBuffer("trac1lj5ccpygyelu266enxjr2m0hkf2p5nkr4ua2gq9a2pj6ewq54p9qkydxud"),
        bdo: {
            bs: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            vn: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            vs: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        }
    }
    console.log(test)
    const result = check.validateBootstrapDeployment(test)
    t.ok(result, 'Valid data should pass the validation')
})

test('validateBootstrapDeployment - missing validator fields combinations', async t => {
    const baseBdo = {
        bs: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
        in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
        is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
    }

    const validatorFields = {
        vn: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
        vs: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
        va: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
    }

    const baseTest = {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: addressToBuffer("trac1lj5ccpygyelu266enxjr2m0hkf2p5nkr4ua2gq9a2pj6ewq54p9qkydxud"),
    }

    t.test('missing vn only', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                vs: validatorFields.vs,
                va: validatorFields.va
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, false, 'Should fail when vn is missing')
    })

    t.test('missing vs only', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                vn: validatorFields.vn,
                va: validatorFields.va
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, false, 'Should fail when vs is missing')
    })

    t.test('missing va only', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                vn: validatorFields.vn,
                vs: validatorFields.vs
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, false, 'Should fail when va is missing')
    })

    t.test('missing vn and vs', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                va: validatorFields.va
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, false, 'Should fail when vn and vs are missing')
    })

    t.test('missing vn and va', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                vs: validatorFields.vs
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, false, 'Should fail when vn and va are missing')
    })

    t.test('missing vs and va', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                vn: validatorFields.vn
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, false, 'Should fail when vs and va are missing')
    })

    t.test('missing all validator fields', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo
            }
        }
        const result = check.validateBootstrapDeployment(test)
        t.is(result, true, 'Should not fail when all validator fields are missing')
    })
})

test('validateBootstrapDeployment - optional fields null cases', async t => {
    const baseBdo = {
        bs: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
        in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
        is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
        vn: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
        vs: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
        va: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
    }

    const baseTest = {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: addressToBuffer("trac1lj5ccpygyelu266enxjr2m0hkf2p5nkr4ua2gq9a2pj6ewq54p9qkydxud"),
    }


    t.test('multiple fields null', t => {
        const test = {
            ...baseTest,
            bdo: {
                ...baseBdo,
                vn: null,
                vs: null,
                va: null
            }
        }
        console.log(test)
        const result = check.validateBootstrapDeployment(test)
        console.log(result)
        t.is(result, false, 'Should fail when multiple validator fields are null')
    })
})

test('validateBootstrapDeployment - data type validation TOP LEVEL', t => {
    topLevelValidationTests(
        t,
        check.validateBootstrapDeployment.bind(check),
        BSD.valid_bootstrap_deployment,
        'bdo',
        notAllowedDataTypes,
        BSD.topFieldsBootstrapDeployment
    );
});

test('validateBootstrapDeployment - value level validation (bdo)', t => {
    valueLevelValidationTest(
        t,
        check.validateBootstrapDeployment.bind(check),
        BSD.valid_bootstrap_deployment,
        'bdo',
        BSD.bootstrapDeploymentValueFields,
        notAllowedDataTypes
    );
});

test('validateBootstrapDeployment - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        check.validateBootstrapDeployment.bind(check),
        BSD.valid_bootstrap_deployment,
    );
});

test('validateBootstrapDeployment - Buffer length validation - VALUE LEVEL (bdo)', t => {
    fieldsBufferLengthTest(
        t,
        check.validateBootstrapDeployment.bind(check),
        BSD.valid_bootstrap_deployment,
        'bdo',
        BSD.requiredLengthOfFieldsForBootstrapDeployment
    );
});
