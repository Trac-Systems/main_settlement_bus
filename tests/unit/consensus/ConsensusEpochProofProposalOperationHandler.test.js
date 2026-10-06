import test from 'brittle';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import ConsensusEpochProofProposalOperationHandler from '../../../src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js';
import ConsensusConnectionPolicy from '../../../src/core/consensus/ConsensusConnectionPolicy.js';
import { Logger } from '../../../src/utils/logger.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import V1EpochProofProposalApproval from '../../../src/core/consensus/v1/validators/V1EpochProofProposalApproval.js';
import { V1ConsensusProtocolError } from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import consensusV1OperationFixtures from '../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../helpers/config.js';
import { testKeyPair2 } from '../../fixtures/apply.fixtures.js';
import { addressToBuffer } from '../../../src/core/state/utils/address.js';
import { encodeProofProposalApproval } from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {createMessage, uint32ToBuffer} from '../../../src/utils/buffer.js';
import {
    CustomEventType,
    ConsensusOperationType,
    ConsensusResultCode
} from '../../../src/utils/constants.js';

const originalRequestValidate = V1EpochProofProposalRequest.prototype.validate;
const originalApprovalValidate = V1EpochProofProposalApproval.prototype.validate;
const consensusEventNames = [
    [CustomEventType.EPOCH_PROPOSAL_RECEIVED, 'onEpochProposalReceived'],
    [CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, 'onEpochProposalValidationSuccess'],
    [CustomEventType.EPOCH_PROPOSAL_VALIDATION_FAILURE, 'onEpochProposalValidationFailure'],
    [CustomEventType.EPOCH_PROPOSAL_APPROVAL_RECEIVED, 'onApprovalResponseReceived'],
    [CustomEventType.EPOCH_PROPOSAL_APPROVAL_SUCCESS, 'onApprovalResponseSuccess'],
    [CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE, 'onApprovalResponseFailure'],
    [CustomEventType.CONSENSUS_PEER_BAN_REQUESTED, 'onConsensusPeerBanRequested']
];

function restorePatches() {
    V1EpochProofProposalRequest.prototype.validate = originalRequestValidate;
    V1EpochProofProposalApproval.prototype.validate = originalApprovalValidate;
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
            indexers: {
                closed: false,
                close() {
                    this.closed = true;
                    calls.push({ name: 'close' });
                },
                sendAndForget(response) {
                    calls.push({ name: 'send', response });
                    if (overrides.sendError) throw overrides.sendError;
                    connection.sent.push(response);
                }
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

    return connection
}

function setupHandler(t, calls, options = {}) {
    restorePatches();
    t.teardown(restorePatches);

    const state = options.state ?? new EventEmitter();
    for (const [eventName, name] of consensusEventNames) {
        const listener = context => {
            calls.push({ name, context });
        };
        state.on(eventName, listener);
        t.teardown(() => state.off(eventName, listener));
    }

    V1EpochProofProposalRequest.prototype.validate = options.requestValidate ?? (async () => true);
    V1EpochProofProposalApproval.prototype.validate = options.approvalValidate ?? (async payload => ({
        resultCode: ConsensusResultCode.OK,
        approval: payload.proof_proposal_response.approval
    }));

    const handlerConfig = options.config ?? config;
    const connectionPolicy = new ConsensusConnectionPolicy(state, new Logger(handlerConfig));
    return new ConsensusEpochProofProposalOperationHandler(
        state,
        options.wallet ?? {},
        handlerConfig,
        connectionPolicy
    );
}

function callNames(calls) {
    return calls.map(call => call.name);
}

async function verifyProofProposalApprovalSignature(proofProposal, approval, publicKey) {
    const message = createMessage(
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.difficulty,
        proofProposal.discriminant_bit_size,
        proofProposal.proof,
        approval.approver,
        proofProposal.signature
    );
    const hash = await tracCryptoApi.hash.blake3(message);

    return tracCryptoApi.signature.verify(approval.approval_sig, hash, publicKey);
}

async function verifyProofProposalResponseSignature(response, publicKey) {
    const resultCode = uint32ToBuffer(response.result);
    const message = response.approval
        ? createMessage(resultCode, encodeProofProposalApproval(response.approval))
        : createMessage(resultCode);
    const hash = await tracCryptoApi.hash.blake3(message);

    return tracCryptoApi.signature.verify(response.response_sig, hash, publicKey);
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

    const result = await handler.handleRequest(message, connection, connection.protocolSession.indexers, connection.protocolSession.indexers);

    t.absent(result);
    t.is(validatorPayload, message);
    t.is(validatorConnection, connection);
    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationSuccess',
        'send'
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
    // the indexer connection is kept alive after responding, so it can be reused for future proposal rounds
    t.absent(connection.flushed);
    t.absent(connection.ended);

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
        proofProposalResponse.approval,
        wallet.publicKey
    ));
    t.ok(await verifyProofProposalResponseSignature(proofProposalResponse, wallet.publicKey));
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

    await handler.handleRequest(message, connection, connection.protocolSession.indexers);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationFailure',
        'send'
    ]);

    const failureContext = calls[2].context;
    t.is(failureContext.resultCode, ConsensusResultCode.INVALID_PAYLOAD);
    t.is(failureContext.error, validationError);

    const proofProposalResponse = connection.sent[0].proof_proposal_response;
    t.is(proofProposalResponse.result, ConsensusResultCode.INVALID_PAYLOAD);
    t.absent(proofProposalResponse.approval);
    t.ok(await verifyProofProposalResponseSignature(proofProposalResponse, wallet.publicKey));
});

test('handleRequest requests a ban for a local public key mismatch without sending a response', async t => {
    const calls = [];
    const message = proofProposalMessage();
    const connection = createConnection(calls);
    const validationError = new V1ConsensusProtocolError(
        ConsensusResultCode.PUBLIC_KEY_MISMATCH,
        'Address does not match remote public key.'
    );
    const handler = setupHandler(t, calls, {
        wallet: {
            sign() {
                t.fail('must not sign a response for a banned peer');
            }
        },
        requestValidate: async () => {
            calls.push({ name: 'validateRequest' });
            throw validationError;
        }
    });
    handler.displayError = () => t.fail('must not attempt to build or send a response');

    await handler.handleRequest(message, connection, connection.protocolSession.indexers);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationFailure',
        'onConsensusPeerBanRequested'
    ]);
    t.is(calls[2].context.error, validationError);
    t.is(calls[2].context.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
    t.is(calls[2].context.connection, connection);
    t.is(calls[3].context.connection, connection);
    t.is(calls[3].context.error, validationError);
    t.is(connection.sent.length, 0);
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

    await handler.handleRequest(message, connection, connection.protocolSession.indexers);

    const failureContext = calls[2].context;
    const proofProposalResponse = connection.sent[0].proof_proposal_response;
    t.is(failureContext.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
    t.is(proofProposalResponse.result, ConsensusResultCode.UNEXPECTED_ERROR);
    t.absent(proofProposalResponse.approval);
    t.ok(await verifyProofProposalResponseSignature(proofProposalResponse, wallet.publicKey));
});

test('handleRequest sends signed rejection for malformed proof proposal with valid session id', async t => {
    const wallet = await createWallet();
    const calls = [];
    let proofProposalRead = false;
    const message = {
        type: ConsensusOperationType.PROOF_PROPOSAL,
        session_id: 'malformed-proof-proposal',
        timestamp: 1
    };
    Object.defineProperty(message, 'proof_proposal', {
        get() {
            proofProposalRead = true;
            throw new Error('proof proposal should not be read after validation failure');
        }
    });
    const connection = createConnection(calls);
    const validationError = new V1ConsensusProtocolError(
        ConsensusResultCode.SCHEMA_VALIDATION_FAILED,
        'invalid proof proposal schema'
    );
    const handler = setupHandler(t, calls, {
        wallet,
        requestValidate: async () => {
            calls.push({ name: 'validateRequest' });
            throw validationError;
        }
    });

    await handler.handleRequest(message, connection, connection.protocolSession.indexers);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationFailure',
        'send'
    ]);
    t.absent(proofProposalRead);

    const response = connection.sent[0];
    t.is(response.session_id, message.session_id);

    const proofProposalResponse = response.proof_proposal_response;
    t.is(proofProposalResponse.result, ConsensusResultCode.SCHEMA_VALIDATION_FAILED);
    t.absent(proofProposalResponse.approval);
    t.ok(await verifyProofProposalResponseSignature(proofProposalResponse, wallet.publicKey));
});

test('handleRequest closes only consensus without response when session id is invalid', async t => {
    const wallet = await createWallet();
    const calls = [];
    const message = proofProposalMessage({ session_id: '' });
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

    await handler.handleRequest(message, connection, connection.protocolSession.indexers);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationFailure',
        'close'
    ]);
    t.is(connection.sent.length, 0);
    t.absent(connection.flushed);
    t.absent(connection.ended);
    t.ok(connection.protocolSession.indexers.closed);
});

test('handleRequest logs a response send failure without closing the session or transport', async t => {
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

    await handler.handleRequest(message, connection, connection.protocolSession.indexers);

    t.alike(callNames(calls), [
        'onEpochProposalReceived',
        'validateRequest',
        'onEpochProposalValidationSuccess',
        'send'
    ]);
    t.is(connection.sent.length, 0);
    t.absent(connection.flushed);
    t.absent(connection.ended);
    t.absent(connection.protocolSession.indexers.closed);
    t.is(displayErrors.length, 1);
    t.is(displayErrors[0].error, sendError);
    t.is(displayErrors[0].remotePublicKey, connection.remotePublicKey);
});

test('handleRequest logs a response signing failure through Logger without closing anything', async t => {
    const wallet = await createWallet();
    const calls = [];
    const connection = createConnection(calls);
    const errors = [];
    const originalConsoleError = console.error;
    console.error = message => errors.push(message);
    t.teardown(() => { console.error = originalConsoleError; });
    const handler = setupHandler(t, calls, {
        wallet: {
            address: wallet.address,
            sign() { throw new Error('signer unavailable'); }
        }
    });

    await handler.handleRequest(proofProposalMessage(), connection, connection.protocolSession.indexers);

    t.is(connection.sent.length, 0);
    t.absent(connection.ended);
    t.absent(connection.protocolSession.indexers.closed);
    t.is(errors.length, 1);
    t.ok(errors[0].includes('e: '), 'uses the shared logger format');
    t.ok(errors[0].includes('Consensus V1 message'));
    t.ok(errors[0].includes('signer unavailable'));
});

test('handleRequest skips response building when consensus closes during validation', async t => {
    const calls = [];
    const connection = createConnection(calls);
    const session = connection.protocolSession.indexers;
    const handler = setupHandler(t, calls, {
        wallet: { sign() { t.fail('closed session must not sign a response'); } },
        requestValidate: async () => { session.close(); }
    });
    handler.displayError = () => t.fail('closed session must not attempt to build a response');

    await handler.handleRequest(proofProposalMessage(), connection, session);

    t.is(connection.sent.length, 0);
    t.absent(connection.ended);
});

test('handleRequest skips sending when consensus closes while the response is being built', async t => {
    const wallet = await createWallet();
    const calls = [];
    const connection = createConnection(calls);
    const session = connection.protocolSession.indexers;
    const handler = setupHandler(t, calls, {
        wallet: {
            address: wallet.address,
            sign(data) {
                if (!session.closed) session.close();
                return wallet.sign(data);
            }
        }
    });
    handler.displayError = () => t.fail('response should build successfully');

    await handler.handleRequest(proofProposalMessage(), connection, session);

    t.ok(session.closed);
    t.is(connection.sent.length, 0);
    t.absent(calls.some(call => call.name === 'send'), 'does not attempt to send on the closed session');
    t.absent(connection.ended);
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
            return {
                resultCode: ConsensusResultCode.OK,
                approval: payload.proof_proposal_response.approval
            };
        }
    });

    const result = await handler.handleApproval(message, connection, connection.protocolSession.indexers, proofProposal);

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

test('handleApproval requests a ban for a local public key mismatch', async t => {
    const calls = [];
    const connection = createConnection(calls);
    const validationError = new V1ConsensusProtocolError(
        ConsensusResultCode.PUBLIC_KEY_MISMATCH,
        'Address does not match remote public key.'
    );
    const handler = setupHandler(t, calls, {
        approvalValidate: async () => { throw validationError; }
    });

    const result = await handler.handleApproval(
        proofProposalApprovalMessage(), connection, connection.protocolSession.indexers,
        consensusV1OperationFixtures.proofProposal
    );

    t.alike(callNames(calls), [
        'onApprovalResponseReceived',
        'onApprovalResponseFailure',
        'onConsensusPeerBanRequested'
    ]);
    t.is(result.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
    t.is(calls[1].context.error, validationError);
    t.is(calls[2].context.error, validationError);
    t.is(calls[2].context.connection, connection);
});

test('handleApproval reports a validated peer rejection without requesting a ban', async t => {
    const calls = [];
    const message = proofProposalApprovalMessage({
        result: ConsensusResultCode.PUBLIC_KEY_MISMATCH,
        approval: undefined
    });
    const proofProposal = consensusV1OperationFixtures.proofProposal;
    const connection = createConnection(calls);
    const handler = setupHandler(t, calls, {
        approvalValidate: async () => {
            calls.push({ name: 'validateApproval' });
            return { resultCode: ConsensusResultCode.PUBLIC_KEY_MISMATCH };
        }
    });

    const result = await handler.handleApproval(message, connection, connection.protocolSession.indexers, proofProposal);

    t.alike(result, { resultCode: ConsensusResultCode.PUBLIC_KEY_MISMATCH });
    t.alike(callNames(calls), [
        'onApprovalResponseReceived',
        'validateApproval',
        'onApprovalResponseFailure'
    ]);
    t.is(calls[2].context.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
    t.absent(calls[2].context.error);
    t.absent(calls[2].context.approval);
    t.absent(connection.ended);
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
