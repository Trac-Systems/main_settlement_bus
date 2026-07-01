import test from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';

import ConsensusEpochProofProposalOperationHandler from '../../../src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js';
import ConsensusEpochProofProposalEventHandler from '../../../src/core/consensus/v1/handlers/ConsensusEpochProofProposalEventHandler.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import V1EpochProofProposalApproval from '../../../src/core/consensus/v1/validators/V1EpochProofProposalApproval.js';
import { V1ConsensusProtocolError } from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import consensusV1OperationFixtures from '../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../helpers/config.js';
import { testKeyPair2 } from '../../fixtures/apply.fixtures.js';
import { addressToBuffer } from '../../../src/core/state/utils/address.js';
import {
    ConsensusOperationType,
    ConsensusResultCode
} from '../../../src/utils/constants.js';
import {
    verifyProofProposalApprovalSignature,
    verifyProofProposalResponseSignature
} from '../../../src/utils/consensus/v1/epochProofProposalSignatureUtils.js';

const originalRequestValidate = V1EpochProofProposalRequest.prototype.validate;
const originalApprovalValidate = V1EpochProofProposalApproval.prototype.validate;
const eventMethodNames = [
    'onEpochProposalReceived',
    'onEpochProposalValidationSuccess',
    'onEpochProposalValidationFailure',
    'onApprovalResponseReceived',
    'onApprovalResponseSuccess',
    'onApprovalResponseFailure',
    'onApprovalResponseWithoutPendingRequest'
];
const originalEventMethods = new Map(
    eventMethodNames.map(name => [
        name,
        ConsensusEpochProofProposalEventHandler.prototype[name]
    ])
);

function restorePatches() {
    V1EpochProofProposalRequest.prototype.validate = originalRequestValidate;
    V1EpochProofProposalApproval.prototype.validate = originalApprovalValidate;

    for (const [name, method] of originalEventMethods.entries()) {
        ConsensusEpochProofProposalEventHandler.prototype[name] = method;
    }
}

async function createWallet(keyPair = testKeyPair2) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

function proofProposalMessage(overrides = {}) {
    return {
        ...consensusV1OperationFixtures.proofProposalHeader,
        session_id: overrides.session_id ?? consensusV1OperationFixtures.proofProposalHeader.session_id,
        proof_proposal: {
            ...consensusV1OperationFixtures.proofProposal,
            ...overrides.proof_proposal
        }
    };
}

function proofProposalApprovalMessage(responseOverrides = {}) {
    return {
        ...consensusV1OperationFixtures.proofProposalResponseHeader,
        proof_proposal_response: {
            ...consensusV1OperationFixtures.proofProposalResponse,
            ...responseOverrides
        }
    };
}

function createConnection(calls, overrides = {}) {
    const connection = {
        remotePublicKey: overrides.remotePublicKey ?? b4a.alloc(32, 7),
        sent: [],
        ended: false,
        flushed: false,
        protocolSession: {
            sendAndForget(response) {
                calls.push({ name: 'send', response });
                if (overrides.sendError) throw overrides.sendError;
                connection.sent.push(response);
            }
        },
        async flush() {
            calls.push({ name: 'flush' });
            connection.flushed = true;
        },
        end() {
            calls.push({ name: 'end' });
            connection.ended = true;
        }
    };

    return connection;
}

function setupHandler(t, calls, options = {}) {
    restorePatches();
    t.teardown(restorePatches);

    for (const name of eventMethodNames) {
        ConsensusEpochProofProposalEventHandler.prototype[name] = async context => {
            calls.push({ name, context });
        };
    }

    V1EpochProofProposalRequest.prototype.validate = options.requestValidate ?? (async () => true);
    V1EpochProofProposalApproval.prototype.validate = options.approvalValidate ?? (async () => true);

    return new ConsensusEpochProofProposalOperationHandler(
        options.state ?? {},
        options.wallet ?? {},
        options.config ?? config
    );
}

function callNames(calls) {
    return calls.map(call => call.name);
}

test('handleRequest validates proposal, emits success events, and sends signed OK approval', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalMessage();
    const connection = createConnection(calls);
    let validatorPayload;
    let validatorConnection;
    const handler = setupHandler(t, calls, {
        wallet,
        requestValidate: async (payload, conn) => {
            calls.push({ name: 'validateRequest' });
            validatorPayload = payload;
            validatorConnection = conn;
            return true;
        }
    });

    const result = await handler.handleRequest(message, connection);

    t.absent(result);
    t.is(validatorPayload, message);
    t.is(validatorConnection, connection);
    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationSuccess',
        'send',
        'flush',
        'end'
    ]);

    const receivedContext = calls[0].context;
    t.is(receivedContext.message, message);
    t.is(receivedContext.connection, connection);
    t.is(receivedContext.sessionId, message.session_id);
    t.is(receivedContext.remotePublicKey, connection.remotePublicKey);

    const successContext = calls[2].context;
    t.is(successContext.proofProposal, message.proof_proposal);
    t.is(successContext.resultCode, ConsensusResultCode.OK);

    t.is(connection.sent.length, 1);
    t.ok(connection.flushed);
    t.ok(connection.ended);

    const response = connection.sent[0];
    t.is(response.type, ConsensusOperationType.PROOF_PROPOSAL_APPROVAL);
    t.is(response.session_id, message.session_id);

    const proofProposalResponse = response.proof_proposal_response;
    t.is(proofProposalResponse.result, ConsensusResultCode.OK);
    t.alike(
        proofProposalResponse.approval.approver,
        addressToBuffer(wallet.address, config.addressPrefix)
    );
    t.ok(await verifyProofProposalApprovalSignature(
        message.proof_proposal,
        proofProposalResponse.approval
    ));
    t.ok(await verifyProofProposalResponseSignature(proofProposalResponse));
});

test('handleRequest maps consensus validation errors to signed rejection responses', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalMessage();
    const connection = createConnection(calls);
    const validationError = new V1ConsensusProtocolError(
        ConsensusResultCode.INVALID_PAYLOAD,
        'invalid proof proposal'
    );
    const handler = setupHandler(t, calls, {
        wallet,
        requestValidate: async () => {
            calls.push({ name: 'validateRequest' });
            throw validationError;
        }
    });

    await handler.handleRequest(message, connection);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationFailure',
        'send',
        'flush',
        'end'
    ]);

    const failureContext = calls[2].context;
    t.is(failureContext.resultCode, ConsensusResultCode.INVALID_PAYLOAD);
    t.is(failureContext.error, validationError);

    const proofProposalResponse = connection.sent[0].proof_proposal_response;
    t.is(proofProposalResponse.result, ConsensusResultCode.INVALID_PAYLOAD);
    t.absent(proofProposalResponse.approval);
    t.ok(await verifyProofProposalResponseSignature(
        proofProposalResponse,
        proofProposalResponse.approval?.approver ?? wallet.publicKey
    ));
});

test('handleRequest maps unexpected validation errors to UNEXPECTED_ERROR responses', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalMessage();
    const connection = createConnection(calls);
    const handler = setupHandler(t, calls, {
        wallet,
        requestValidate: async () => {
            calls.push({ name: 'validateRequest' });
            throw new Error('boom');
        }
    });

    await handler.handleRequest(message, connection);

    const failureContext = calls[2].context;
    const proofProposalResponse = connection.sent[0].proof_proposal_response;
    t.is(failureContext.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
    t.is(proofProposalResponse.result, ConsensusResultCode.UNEXPECTED_ERROR);
    t.absent(proofProposalResponse.approval);
    t.ok(await verifyProofProposalResponseSignature(
        proofProposalResponse,
        proofProposalResponse.approval?.approver ?? wallet.publicKey
    ));
});

test('handleRequest ends the connection when response sending fails', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalMessage();
    const sendError = new Error('send failed');
    const connection = createConnection(calls, { sendError });
    const displayErrors = [];
    const handler = setupHandler(t, calls, {
        wallet,
        requestValidate: async () => {
            calls.push({ name: 'validateRequest' });
            return true;
        }
    });
    handler.displayError = (step, remotePublicKey, error) => {
        displayErrors.push({ step, remotePublicKey, error });
    };

    await handler.handleRequest(message, connection);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationSuccess',
        'send',
        'end'
    ]);
    t.is(connection.sent.length, 0);
    t.absent(connection.flushed);
    t.ok(connection.ended);
    t.is(displayErrors.length, 1);
    t.is(displayErrors[0].error, sendError);
    t.is(displayErrors[0].remotePublicKey, connection.remotePublicKey);
});

test('handleApproval validates OK responses, emits success, and returns approval', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalApprovalMessage();
    const proofProposal = consensusV1OperationFixtures.proofProposal;
    const connection = createConnection(calls);
    let validatorPayload;
    let validatorConnection;
    let validatorProofProposal;
    const handler = setupHandler(t, calls, {
        wallet,
        approvalValidate: async (payload, conn, proposal) => {
            calls.push({ name: 'validateApproval' });
            validatorPayload = payload;
            validatorConnection = conn;
            validatorProofProposal = proposal;
            return true;
        }
    });

    const result = await handler.handleApproval(message, connection, proofProposal);

    t.is(validatorPayload, message);
    t.is(validatorConnection, connection);
    t.is(validatorProofProposal, proofProposal);
    t.alike(callNames(calls), [
        'onApprovalResponseReceived',
        'validateApproval',
        'onApprovalResponseSuccess'
    ]);
    t.alike(result, {
        resultCode: ConsensusResultCode.OK,
        approval: message.proof_proposal_response.approval
    });

    const receivedContext = calls[0].context;
    t.is(receivedContext.message, message);
    t.is(receivedContext.connection, connection);
    t.is(receivedContext.sessionId, message.session_id);
    t.is(receivedContext.remotePublicKey, connection.remotePublicKey);
    t.is(receivedContext.proofProposal, proofProposal);

    const successContext = calls[2].context;
    t.is(successContext.resultCode, ConsensusResultCode.OK);
    t.is(successContext.approval, message.proof_proposal_response.approval);
});

test('handleApproval maps consensus validation failure and does not read approval payload', async t => {
    const wallet = await createWallet();
    const calls = [];
    let proofProposalResponseRead = false;
    const message = {
        type: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL,
        session_id: 'approval-validation-failure',
        timestamp: 1
    };
    Object.defineProperty(message, 'proof_proposal_response', {
        get() {
            proofProposalResponseRead = true;
            throw new Error('approval payload should not be read after validation failure');
        }
    });
    const proofProposal = consensusV1OperationFixtures.proofProposal;
    const connection = createConnection(calls);
    const validationError = new V1ConsensusProtocolError(
        ConsensusResultCode.INVALID_PAYLOAD,
        'invalid approval response'
    );
    const handler = setupHandler(t, calls, {
        wallet,
        approvalValidate: async () => {
            calls.push({ name: 'validateApproval' });
            throw validationError;
        }
    });

    const result = await handler.handleApproval(message, connection, proofProposal);

    t.alike(callNames(calls), [
        'onApprovalResponseReceived',
        'validateApproval',
        'onApprovalResponseFailure'
    ]);
    t.alike(result, { resultCode: ConsensusResultCode.INVALID_PAYLOAD });
    t.absent(proofProposalResponseRead);
    t.is(calls[2].context.resultCode, ConsensusResultCode.INVALID_PAYLOAD);
    t.is(calls[2].context.error, validationError);
});

test('handleApproval maps unexpected validation errors to UNEXPECTED_ERROR', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalApprovalMessage();
    const proofProposal = consensusV1OperationFixtures.proofProposal;
    const connection = createConnection(calls);
    const validationError = new Error('unexpected approval failure');
    const handler = setupHandler(t, calls, {
        wallet,
        approvalValidate: async () => {
            calls.push({ name: 'validateApproval' });
            throw validationError;
        }
    });

    const result = await handler.handleApproval(message, connection, proofProposal);

    t.alike(callNames(calls), [
        'onApprovalResponseReceived',
        'validateApproval',
        'onApprovalResponseFailure'
    ]);
    t.alike(result, { resultCode: ConsensusResultCode.UNEXPECTED_ERROR });
    t.is(calls[2].context.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
    t.is(calls[2].context.error, validationError);
});
