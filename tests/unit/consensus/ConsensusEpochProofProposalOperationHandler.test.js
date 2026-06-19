import test from 'brittle';
import b4a from 'b4a';

import ConsensusEpochProofProposalOperationHandler from '../../../src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import consensusV1OperationFixtures from '../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../helpers/config.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';

const originalRequestValidate = V1EpochProofProposalRequest.prototype.validate;

function restoreValidator() {
    V1EpochProofProposalRequest.prototype.validate = originalRequestValidate;
}

function setupHandler(t, validate, state = {}) {
    restoreValidator();
    t.teardown(restoreValidator);
    V1EpochProofProposalRequest.prototype.validate = validate;

    return new ConsensusEpochProofProposalOperationHandler(state, {}, config);
}

function currentEpochFor(proofProposal, overrides = {}) {
    return {
        epoch: proofProposal.epoch.readBigUInt64BE(0) - 1n,
        epoch_record_hash: proofProposal.previous_epoch_record_hash,
        ...overrides
    };
}

function connection() {
    return {
        remotePublicKey: b4a.alloc(32, 1),
        protocolSession: {
            sendAndForget() {
                throw new Error('response sending is not part of this step');
            }
        }
    };
}

test('handleRequest validates consensus proof proposal and returns the extracted payload', async t => {
    const conn = connection();
    const message = { ...consensusV1OperationFixtures.proofProposalHeader };
    const state = {
        currentEpoch: async () => currentEpochFor(message.proof_proposal)
    };
    let validatorPayload;
    let validatorRemotePublicKey;

    Object.defineProperty(message, 'epoch_proof_proposal_request', {
        get() {
            throw new Error('legacy epoch proof proposal request field should not be read');
        }
    });

    const handler = setupHandler(t, async (payload, remotePublicKey) => {
        validatorPayload = payload;
        validatorRemotePublicKey = remotePublicKey;
        return true;
    }, state);

    const result = await handler.handleRequest(message, conn);

    t.is(validatorPayload, message);
    t.alike(validatorRemotePublicKey, conn.remotePublicKey);
    t.alike(result, message.proof_proposal);
});

test('handleRequest stops when request validation fails', async t => {
    const conn = connection();
    const message = { ...consensusV1OperationFixtures.proofProposalHeader };
    let proofProposalRead = false;

    Object.defineProperty(message, 'proof_proposal', {
        get() {
            proofProposalRead = true;
            throw new Error('proof proposal should not be read after validation failure');
        }
    });

    const handler = setupHandler(t, async () => {
        throw new Error('validation failed');
    });

    await t.exception(
        async () => handler.handleRequest(message, conn),
        errorMessageIncludes('validation failed')
    );
    t.absent(proofProposalRead);
});

test('handleRequest rejects proof proposals that skip the next epoch', async t => {
    const conn = connection();
    const message = { ...consensusV1OperationFixtures.proofProposalHeader };
    const state = {
        currentEpoch: async () => currentEpochFor(
            message.proof_proposal,
            { epoch: message.proof_proposal.epoch.readBigUInt64BE(0) - 2n }
        )
    };
    const handler = setupHandler(t, async () => true, state);

    await t.exception(
        async () => handler.handleRequest(message, conn),
        errorMessageIncludes('not for the next epoch')
    );
});

test('handleRequest rejects proof proposals with a mismatched previous epoch record hash', async t => {
    const conn = connection();
    const message = { ...consensusV1OperationFixtures.proofProposalHeader };
    const state = {
        currentEpoch: async () => currentEpochFor(
            message.proof_proposal,
            { epoch_record_hash: b4a.alloc(32, 9) }
        )
    };
    const handler = setupHandler(t, async () => true, state);

    await t.exception(
        async () => handler.handleRequest(message, conn),
        errorMessageIncludes('Previous epoch record hash does not match')
    );
});
