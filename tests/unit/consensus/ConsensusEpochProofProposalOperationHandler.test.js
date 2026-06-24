import test from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';
import { solveWesolowski } from '@tracsystems/trac-vdf';

import ConsensusEpochProofProposalOperationHandler from '../../../src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import V1EpochProofProposalResponse from '../../../src/core/consensus/v1/validators/V1EpochProofProposalResponse.js';
import consensusV1OperationFixtures from '../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../helpers/config.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';
import {
    ConsensusOperationType,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import { addressToBuffer } from '../../../src/core/state/utils/address.js';
import {
    verifyProofProposalApprovalSignature,
    verifyProofProposalResponseSignature
} from '../../../src/utils/consensus/v1/epochProofProposalSignatureUtils.js';
import { testKeyPair2 } from '../../fixtures/apply.fixtures.js';

const originalRequestValidate = V1EpochProofProposalRequest.prototype.validate;
const originalResponseValidate = V1EpochProofProposalResponse.prototype.validate;
const vdfTestConfig = {
    addressPrefix: config.addressPrefix,
    vdfDifficulty: 100,
    vdfDiscriminantSizeBits: 512
};

function restoreValidator() {
    V1EpochProofProposalRequest.prototype.validate = originalRequestValidate;
    V1EpochProofProposalResponse.prototype.validate = originalResponseValidate;
}

async function createWallet(keyPair) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

function setupHandler(t, validate, state = {}, wallet = {}, responseValidate = async () => true, handlerConfig = config) {
    restoreValidator();
    t.teardown(restoreValidator);
    V1EpochProofProposalRequest.prototype.validate = validate;
    V1EpochProofProposalResponse.prototype.validate = responseValidate;

    return new ConsensusEpochProofProposalOperationHandler(state, wallet, handlerConfig);
}

function currentEpochFor(proofProposal, overrides = {}) {
    return {
        epoch: proofProposal.epoch.readBigUInt64BE(0) - 1n,
        epoch_record_hash: proofProposal.previous_epoch_record_hash,
        ...overrides
    };
}

function messageWithProofProposalOverrides(overrides = {}) {
    return {
        ...consensusV1OperationFixtures.proofProposalHeader,
        proof_proposal: {
            ...consensusV1OperationFixtures.proofProposal,
            ...overrides
        }
    };
}

async function messageWithValidVdfProof(overrides = {}) {
    const proofProposal = {
        ...consensusV1OperationFixtures.proofProposal,
        ...overrides
    };

    const vdfProof = await solveWesolowski(
        proofProposal.previous_epoch_record_hash,
        vdfTestConfig.vdfDifficulty,
        vdfTestConfig.vdfDiscriminantSizeBits
    );

    return messageWithProofProposalOverrides({
        ...overrides,
        vdf_proof: vdfProof
    });
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

test('handleRequest validates consensus proof proposal and returns a signed approval response', async t => {
    const wallet = await createWallet(testKeyPair2);
    const conn = connection();
    const message = await messageWithValidVdfProof();
    const state = {
        currentEpoch: async () => currentEpochFor(message.proof_proposal)
    };
    let validatorPayload;
    let validatorConnection;

    Object.defineProperty(message, 'epoch_proof_proposal_request', {
        get() {
            throw new Error('legacy epoch proof proposal request field should not be read');
        }
    });

    const handler = setupHandler(t, async (payload, connection) => {
        validatorPayload = payload;
        validatorConnection = connection;
        return true;
    }, state, wallet, async () => true, vdfTestConfig);

    const result = await handler.handleRequest(message, conn);

    t.is(validatorPayload, message);
    t.is(validatorConnection, conn);
    t.is(result.type, ConsensusOperationType.PROOF_PROPOSAL_RESPONSE);
    t.is(result.session_id, message.session_id);

    const proofProposalResponse = result.proof_proposal_response;
    t.is(proofProposalResponse.result, ConsensusResultCode.OK);
    t.alike(proofProposalResponse.approval.approver, addressToBuffer(wallet.address, config.addressPrefix));
    t.ok(await verifyProofProposalApprovalSignature(
        message.proof_proposal,
        proofProposalResponse.approval
    ));
    t.ok(await verifyProofProposalResponseSignature(proofProposalResponse));
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

test('handleRequest rejects proof proposals with invalid VDF proof data', async t => {
    const conn = connection();
    const message = messageWithProofProposalOverrides({
        vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE)
    });
    const state = {
        currentEpoch: async () => currentEpochFor(message.proof_proposal)
    };
    const handler = setupHandler(t, async () => true, state, {}, async () => true, vdfTestConfig);

    await t.exception(
        async () => handler.handleRequest(message, conn),
        errorMessageIncludes('VDF proof verification failed')
    );
});

test('handleResponse validates consensus proof proposal response and returns approval', async t => {
    const conn = connection();
    const message = { ...consensusV1OperationFixtures.proofProposalResponseHeader };
    let validatorPayload;
    let validatorConnection;
    const handler = setupHandler(
        t,
        async () => true,
        {},
        {},
        async (payload, connection) => {
            validatorPayload = payload;
            validatorConnection = connection;
            return true;
        }
    );

    const result = await handler.handleResponse(message, conn);

    t.is(validatorPayload, message);
    t.is(validatorConnection, conn);
    t.alike(result, message.proof_proposal_response.approval);
});

test('handleResponse stops when response validation fails', async t => {
    const conn = connection();
    const message = { ...consensusV1OperationFixtures.proofProposalResponseHeader };
    let approvalRead = false;

    Object.defineProperty(message, 'proof_proposal_response', {
        get() {
            approvalRead = true;
            throw new Error('approval should not be read after validation failure');
        }
    });

    const handler = setupHandler(
        t,
        async () => true,
        {},
        {},
        async () => {
            throw new Error('response validation failed');
        }
    );

    await t.exception(
        async () => handler.handleResponse(message, conn),
        errorMessageIncludes('response validation failed')
    );
    t.absent(approvalRead);
});
