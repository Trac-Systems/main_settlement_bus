import { test } from 'brittle';

import ResultCodePolicy from '../../../../src/core/network/protocols/ResultCodePolicy.js';
import { ResultCode } from '../../../../src/utils/constants.js';

test('ResultCodePolicy maps OK to SUCCESS', t => {
    t.is(
        ResultCodePolicy.resolveValidatorAction(ResultCode.OK),
        ResultCodePolicy.senderAction.SUCCESS
    );
});

test('ResultCodePolicy maps TX_ALREADY_PENDING to NO_ROTATE', t => {
    t.is(
        ResultCodePolicy.resolveValidatorAction(ResultCode.TX_ALREADY_PENDING),
        ResultCodePolicy.senderAction.NO_ROTATE
    );
});

test('ResultCodePolicy maps TX_COMMITTED_RECEIPT_MISSING to ROTATE', t => {
    t.is(
        ResultCodePolicy.resolveValidatorAction(ResultCode.TX_COMMITTED_RECEIPT_MISSING),
        ResultCodePolicy.senderAction.ROTATE
    );
});

test('ResultCodePolicy maps unknown result code to UNDEFINED', t => {
    t.is(
        ResultCodePolicy.resolveValidatorAction(999999),
        ResultCodePolicy.senderAction.UNDEFINED
    );
});

test('ResultCodePolicy maps every ResultCode constant to a concrete sender action', t => {
    const unassigned = [];

    for (const [name, code] of Object.entries(ResultCode)) {
        const action = ResultCodePolicy.resolveValidatorAction(code);
        if (action === ResultCodePolicy.senderAction.UNDEFINED) {
            unassigned.push(`${name}(${code})`);
        }
    }

    t.alike(
        unassigned,
        [],
        `Unassigned ResultCode entries in policy: ${unassigned.join(', ')}`
    );
});
