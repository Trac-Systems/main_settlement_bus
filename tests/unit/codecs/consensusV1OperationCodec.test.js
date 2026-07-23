import test from 'brittle';
import b4a from 'b4a';
import sinon from 'sinon';

import {
    decodeConsensusMessage,
    decodeProofProposalApproval,
    encodeConsensusMessage,
    encodeProofProposalApproval,
    safeDecodeProofProposalApproval,
    safeEncodeProofProposalApproval,
} from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import fixtures from '../../fixtures/consensusV1Operation.fixtures.js';

test('Consensus v1 codec encodes and decodes message headers', t => {
    const payloadsHashMap = new Map([
        ['proofProposal', fixtures.proofProposalHeader],
        ['proofProposalResponse', fixtures.proofProposalResponseHeader],
    ]);

    for (const [key, payload] of payloadsHashMap) {
        const encoded = encodeConsensusMessage(payload);
        const decoded = decodeConsensusMessage(encoded);

        t.ok(b4a.isBuffer(encoded) && encoded.length > 0, `Payload ${key} encodes to a non-empty buffer`);
        t.alike(decoded, payload, `Payload ${key} decodes back correctly`);
    }
});

test('Consensus codec encodes and decodes ProofProposalApproval independently', t => {
    const encoded = encodeProofProposalApproval(fixtures.proofProposalApproval);
    const decoded = decodeProofProposalApproval(encoded);

    t.ok(b4a.isBuffer(encoded));
    t.alike(decoded, fixtures.proofProposalApproval);
});

test('Consensus codec safely encodes and decodes ProofProposalApproval', t => {
    const encoded = safeEncodeProofProposalApproval(fixtures.proofProposalApproval);
    const decoded = safeDecodeProofProposalApproval(encoded);

    t.ok(b4a.isBuffer(encoded) && encoded.length > 0);
    t.alike(decoded, fixtures.proofProposalApproval);
});

test('Consensus codec safe ProofProposalApproval helpers handle invalid payloads', t => {
    const consoleLog = sinon.stub(console, 'log');
    t.teardown(() => consoleLog.restore());

    const invalidEncoded = safeEncodeProofProposalApproval({
        approver: 67,
        approval_sig: fixtures.proofProposalApproval.approval_sig
    });

    t.ok(b4a.isBuffer(invalidEncoded));
    t.is(invalidEncoded.length, 0);
    t.ok(consoleLog.calledOnceWithExactly('safeEncodeProofProposalApproval error:', 'approver: buffer expected'));
    t.is(safeDecodeProofProposalApproval(null), null);
    t.is(safeDecodeProofProposalApproval({}), null);
    t.is(safeDecodeProofProposalApproval('not-a-buffer'), null);
    t.is(safeDecodeProofProposalApproval(b4a.from([0x0F])), null);
    t.is(consoleLog.callCount, 2);
    t.is(consoleLog.secondCall.args[0], 'safeDecodeProofProposalApproval error:');
    t.ok(typeof consoleLog.secondCall.args[1] === 'string' && consoleLog.secondCall.args[1].length > 0);
});
