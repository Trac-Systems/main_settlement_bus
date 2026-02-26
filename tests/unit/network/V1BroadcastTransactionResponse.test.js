import {test} from 'brittle';
import b4a from 'b4a';

import {extractRequiredVaFromDecodedTx} from '../../../src/core/network/protocols/v1/validators/V1BroadcastTransactionResponse.js';
import {ResultCode} from '../../../src/utils/constants.js';

test('extractRequiredVaFromDecodedTx throws VALIDATOR_TX_OBJECT_INVALID for non-object', t => {
    try {
        extractRequiredVaFromDecodedTx(null);
        t.fail('expected throw');
    } catch (err) {
        t.is(err.resultCode, ResultCode.VALIDATOR_TX_OBJECT_INVALID);
    }
});

test('extractRequiredVaFromDecodedTx throws VALIDATOR_VA_MISSING when va is missing', t => {
    try {
        extractRequiredVaFromDecodedTx({type: 1, txo: {tx: b4a.alloc(32)}});
        t.fail('expected throw');
    } catch (err) {
        t.is(err.resultCode, ResultCode.VALIDATOR_VA_MISSING);
    }
});
