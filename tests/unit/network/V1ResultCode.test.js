import {test} from 'brittle';

import {ResultCode} from '../../../src/utils/constants.js';

test('ResultCode values are unique', t => {
    const values = Object.values(ResultCode);
    t.is(new Set(values).size, values.length);
});

test('ResultCode preserves existing numeric values (append-only)', t => {
    t.is(ResultCode.UNSPECIFIED, 0);
    t.is(ResultCode.OK, 1);
    t.is(ResultCode.INVALID_PAYLOAD, 2);
    t.is(ResultCode.RATE_LIMITED, 3);
    t.is(ResultCode.SIGNATURE_INVALID, 4);
    t.is(ResultCode.UNEXPECTED_ERROR, 5);
    t.is(ResultCode.TIMEOUT, 6);
    t.is(ResultCode.NODE_HAS_NO_WRITE_ACCESS, 7);
    t.is(ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE, 8);
    t.is(ResultCode.NODE_OVERLOADED, 9);
    t.is(ResultCode.TX_ALREADY_PENDING, 10);

    t.is(ResultCode.OPERATION_TYPE_UNKNOWN, 11);
});

