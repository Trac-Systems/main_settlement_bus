import test from 'brittle';

import {
    V1ConsensusProtocolError,
    V1ConsensusPublicKeyMismatchError,
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

test('local public key mismatch retains protocol result code and distinct error identity', t => {
    const error = new V1ConsensusPublicKeyMismatchError();

    t.ok(error instanceof V1ConsensusProtocolError);
    t.is(error.name, 'V1ConsensusPublicKeyMismatchError');
    t.is(getResultCode(error), ConsensusResultCode.PUBLIC_KEY_MISMATCH);
    t.absent(new V1ConsensusProtocolError(
        ConsensusResultCode.PUBLIC_KEY_MISMATCH,
        'Peer rejected our proposal.'
    ) instanceof V1ConsensusPublicKeyMismatchError);
});

test('getResultCode maps non-protocol errors to UNEXPECTED_ERROR', t => {
    t.is(getResultCode(new Error('boom')), ConsensusResultCode.UNEXPECTED_ERROR);
    t.is(getResultCode(undefined), ConsensusResultCode.UNEXPECTED_ERROR);
});
