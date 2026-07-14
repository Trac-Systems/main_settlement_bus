import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import V1EpochProofProposalApproval from '../../../src/core/consensus/v1/validators/V1EpochProofProposalApproval.js';
import {V1ConsensusProtocolError} from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import {bufferToAddress} from '../../../src/core/state/utils/address.js';
import {encodeProofProposalApproval} from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import {config} from '../../helpers/config.js';
import {testKeyPair1, testKeyPair2, testKeyPair3} from '../../fixtures/apply.fixtures.js';
import {errorMessageIncludes} from '../../helpers/regexHelper.js';
import {createMessage, uint32ToBuffer} from '../../../src/utils/buffer.js';

const previousEpochRecordHash = b4a.alloc(32, 1);
const vdfParametersHash = b4a.alloc(32, 2);
const vdfProof = b4a.alloc(VDF_BLOB_PROOF_SIZE, 3);
const state = {
    isIndexerAddress: async () => true
};

async function createWallet(keyPair) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildProofProposalPayload(proposerWallet) {
    const builder = new ConsensusMessageBuilder(proposerWallet, config);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId('session')
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(1)
        .setEpoch(1)
        .setPreviousEpochRecordHash(previousEpochRecordHash)
        .setProposer(proposerWallet.address)
        .setVdfParametersHash(vdfParametersHash)
        .setVdfProof(vdfProof)
        .buildPayload();

    return builder.getResult();
}

async function buildProofProposalApprovalPayload(approverWallet, proofProposalPayload, approverAddress = approverWallet.address) {
    const builder = new ConsensusMessageBuilder(approverWallet, config);
    const proofProposal = proofProposalPayload.proof_proposal;

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL_APPROVAL)
        .setSessionId(proofProposalPayload.session_id)
        .setTimestamp()
        .setProtocolVersion(proofProposal.protocol_version[0])
        .setNetworkId(proofProposal.network_id.readUInt16BE(0))
        .setEpoch(Number(proofProposal.epoch.readBigUInt64BE(0)))
        .setPreviousEpochRecordHash(proofProposal.previous_epoch_record_hash)
        .setProposer(bufferToAddress(proofProposal.proposer, config.addressPrefix))
        .setVdfParametersHash(proofProposal.vdf_parameters_hash)
        .setVdfProof(proofProposal.vdf_proof)
        .setRequesterProofSignature(proofProposal.signature)
        .setResultCode(ConsensusResultCode.OK)
        .setApprover(approverAddress)
        .buildPayload();

    return builder.getResult();
}

async function buildProofProposalRejectionPayload(approverWallet, proofProposalPayload, result = ConsensusResultCode.INVALID_PAYLOAD) {
    const responseHash = await tracCryptoApi.hash.blake3(createMessage(uint32ToBuffer(result)));

    return {
        type: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL,
        session_id: proofProposalPayload.session_id,
        timestamp: Date.now(),
        proof_proposal_response: {
            result,
            response_sig: approverWallet.sign(responseHash),
        },
    };
}

async function signProofProposalResponse(approverWallet, proofProposalResponse) {
    const resultCode = uint32ToBuffer(proofProposalResponse.result, 0);
    const message = proofProposalResponse.result === ConsensusResultCode.OK
        ? createMessage(resultCode, encodeProofProposalApproval(proofProposalResponse.approval))
        : createMessage(resultCode);
    const responseHash = await tracCryptoApi.hash.blake3(message);

    return approverWallet.sign(responseHash);
}

async function assertProtocolError(t, action, resultCode, messageIncludes) {
    let error;
    try {
        await action();
    } catch (err) {
        error = err;
    }

    t.ok(error instanceof V1ConsensusProtocolError);
    t.is(error.resultCode, resultCode);
    if (messageIncludes) {
        t.ok(error.message.includes(messageIncludes));
    }
}

test('V1EpochProofProposalApproval validates approval signature against original proof proposal', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    await validator.validate(
        approvalPayload,
        {remotePublicKey: approverWallet.publicKey},
        proofProposalPayload.proof_proposal
    );

    t.pass();
});

test('V1EpochProofProposalApproval rejects approver that is not an indexer', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, {
        isIndexerAddress: async () => false
    });
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    await t.exception(
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes('Incoming address is not an indexer.')
    );
});

test('V1EpochProofProposalApproval rejects non-OK response without approval', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalRejectionPayload(approverWallet, proofProposalPayload);

    await assertProtocolError(
        t,
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        ConsensusResultCode.INVALID_PAYLOAD,
        `Proof proposal response result code is not OK: ${ConsensusResultCode.INVALID_PAYLOAD}`
    );
});

test('V1EpochProofProposalApproval rejects fake non-OK response signature before result code handling', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalRejectionPayload(approverWallet, proofProposalPayload);
    const fakeApprovalPayload = {
        ...approvalPayload,
        proof_proposal_response: {
            ...approvalPayload.proof_proposal_response,
            response_sig: b4a.alloc(64, 9)
        }
    };

    await assertProtocolError(
        t,
        async () => validator.validate(
            fakeApprovalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        ConsensusResultCode.RESPONSE_SIGNATURE_INVALID,
        'response signature verification failed'
    );
});

test('V1EpochProofProposalApproval validateSignature does not validate approver address correctness', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const otherWallet = await createWallet(testKeyPair3);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(
        approverWallet,
        proofProposalPayload,
        otherWallet.address
    );

    await validator.validateSignature(
        approvalPayload,
        approverWallet.publicKey,
        proofProposalPayload.proof_proposal
    );

    t.pass();
});

test('V1EpochProofProposalApproval rejects approver address mismatched with remote public key', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const otherWallet = await createWallet(testKeyPair3);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(
        approverWallet,
        proofProposalPayload,
        otherWallet.address
    );

    await assertProtocolError(
        t,
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        ConsensusResultCode.PUBLIC_KEY_MISMATCH,
        'Address does not match remote public key'
    );
});

test('V1EpochProofProposalApproval rejects fake approval signature', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    const fakeApprovalPayload = {
        ...approvalPayload,
        proof_proposal_response: {
            ...approvalPayload.proof_proposal_response,
            approval: {
                ...approvalPayload.proof_proposal_response.approval,
                approval_sig: b4a.alloc(64, 9)
            }
        }
    };
    fakeApprovalPayload.proof_proposal_response.response_sig = await signProofProposalResponse(
        approverWallet,
        fakeApprovalPayload.proof_proposal_response
    );

    await assertProtocolError(
        t,
        async () => validator.validate(
            fakeApprovalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        ConsensusResultCode.APPROVAL_SIGNATURE_INVALID,
        'signature verification failed'
    );
});

test('V1EpochProofProposalApproval rejects fake response signature', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);
    const fakeApprovalPayload = {
        ...approvalPayload,
        proof_proposal_response: {
            ...approvalPayload.proof_proposal_response,
            response_sig: b4a.alloc(64, 9)
        }
    };

    await assertProtocolError(
        t,
        async () => validator.validate(
            fakeApprovalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        ConsensusResultCode.RESPONSE_SIGNATURE_INVALID,
        'response signature verification failed'
    );
});

test('V1EpochProofProposalApproval wraps state failures as protocol errors', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const stateError = new Error('Indexer state is unavailable.');
    const validator = new V1EpochProofProposalApproval(config, {
        isIndexerAddress: async () => {
            throw stateError;
        }
    });
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    try {
        await validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        );
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
        t.is(error.message, 'Indexer state is unavailable.');
        t.is(error.cause, stateError);
    }
});
