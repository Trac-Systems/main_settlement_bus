import test from 'brittle';

import {
    V1ConsensusProtocolError,
    getResultCode
} from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import {ConsensusResultCode} from '../../../src/utils/constants.js';

test('getResultCode returns the attached consensus protocol error result code', t => {
    const error = new V1ConsensusProtocolError(
        ConsensusResultCode.BAD_PROTOCOL_VERSION,
        'bad version'
    );

    t.is(getResultCode(error), ConsensusResultCode.BAD_PROTOCOL_VERSION);
});

test('getResultCode maps non-protocol errors to UNEXPECTED_ERROR', t => {
    t.is(getResultCode(new Error('boom')), ConsensusResultCode.UNEXPECTED_ERROR);
    t.is(getResultCode(undefined), ConsensusResultCode.UNEXPECTED_ERROR);
});
