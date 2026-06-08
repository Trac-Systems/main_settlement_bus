import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';
import {v7 as uuidv7} from 'uuid';

import ConsensusMessageBuilder from '../../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import {addressToBuffer} from '../../../../src/core/state/utils/address.js';
import {
    decodeConsensusMessage,
    encodeConsensusMessage,
    encodeProofProposalApproval
} from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {createMessage, safeWriteUInt32BE} from '../../../../src/utils/buffer.js';
import {ConsensusOperationType, ConsensusResultCode} from '../../../../src/utils/constants.js';
import {errorMessageIncludes} from '../../../helpers/regexHelper.js';
import {config} from '../../../helpers/config.js';
import {testKeyPair1} from '../../../fixtures/apply.fixtures.js';

async function createWallet() {
    return await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
}

function uniqueResultCodes() {
    return [...new Set(Object.values(ConsensusResultCode))].sort((a, b) => a - b);
}

function proofProposalFields(wallet) {
    return {
        sessionId: uuidv7(),
        protocolVersion: 1,
        networkId: 67,
        epoch: 2,
        previousEpochRecordHash: b4a.alloc(32, 1),
        proposer: wallet.address,
        proposerBuffer: addressToBuffer(wallet.address, config.addressPrefix),
        vdfParametersHash: b4a.alloc(32, 2),
        vdfProof: b4a.alloc(96, 3),
        requesterProofSignature: b4a.alloc(64, 4),
    };
}

function setProofProposalFields(builder, fields) {
    return builder
        .setSessionId(fields.sessionId)
        .setTimestamp()
        .setProtocolVersion(fields.protocolVersion)
        .setNetworkId(fields.networkId)
        .setEpoch(fields.epoch)
        .setPreviousEpochRecordHash(fields.previousEpochRecordHash)
        .setProposer(fields.proposer)
        .setVdfParametersHash(fields.vdfParametersHash)
        .setVdfProof(fields.vdfProof);
}

test('ConsensusMessageBuilder builds proof proposal and verifies signature', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const fields = proofProposalFields(wallet);

    await setProofProposalFields(
        builder.setType(ConsensusOperationType.PROOF_PROPOSAL),
        fields
    ).buildPayload();

    const payload = builder.getResult();
    t.is(payload.type, ConsensusOperationType.PROOF_PROPOSAL);
    t.is(payload.session_id, fields.sessionId);
    t.ok(Number.isSafeInteger(payload.timestamp) && payload.timestamp > 0);

    const proofProposal = payload.proof_proposal;
    t.is(proofProposal.protocol_version, fields.protocolVersion);
    t.is(proofProposal.network_id, fields.networkId);
    t.is(proofProposal.epoch, fields.epoch);
    t.alike(proofProposal.previous_epoch_record_hash, fields.previousEpochRecordHash);
    t.alike(proofProposal.proposer, fields.proposerBuffer);
    t.alike(proofProposal.vdf_parameters_hash, fields.vdfParametersHash);
    t.alike(proofProposal.vdf_proof, fields.vdfProof);
    t.ok(b4a.isBuffer(proofProposal.signature));

    const message = createMessage(
        proofProposal.protocol_version,
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.vdf_parameters_hash,
        proofProposal.vdf_proof
    );
    const hash = await tracCryptoApi.hash.blake3(message);
    t.ok(wallet.verify(proofProposal.signature, hash, wallet.publicKey));

    const decoded = decodeConsensusMessage(encodeConsensusMessage(payload));
    t.alike(decoded.proof_proposal, proofProposal);
});

test('ConsensusMessageBuilder iterates proof proposal response ResultCode values', async t => {
    const wallet = await createWallet();
    const fields = proofProposalFields(wallet);

    for (const code of uniqueResultCodes()) {
        const builder = new ConsensusMessageBuilder(wallet, config);
        await setProofProposalFields(
            builder.setType(ConsensusOperationType.PROOF_PROPOSAL_RESPONSE),
            fields
        )
            .setRequesterProofSignature(fields.requesterProofSignature)
            .setResultCode(code)
            .setApprover(wallet.address)
            .buildPayload();

        const payload = builder.getResult();
        t.is(payload.type, ConsensusOperationType.PROOF_PROPOSAL_RESPONSE);
        t.is(payload.proof_proposal_response.result, code);
        t.alike(payload.proof_proposal_response.approval.approver, fields.proposerBuffer);
        t.ok(b4a.isBuffer(payload.proof_proposal_response.approval.approval_sig));
        t.ok(b4a.isBuffer(payload.proof_proposal_response.response_sig));

        const approvalMessage = createMessage(
            fields.protocolVersion,
            fields.networkId,
            fields.epoch,
            fields.previousEpochRecordHash,
            fields.proposerBuffer,
            fields.vdfParametersHash,
            fields.vdfProof,
            payload.proof_proposal_response.approval.approver,
            fields.requesterProofSignature
        );
        const approvalHash = await tracCryptoApi.hash.blake3(approvalMessage);
        t.ok(wallet.verify(
            payload.proof_proposal_response.approval.approval_sig,
            approvalHash,
            wallet.publicKey
        ));

        const encodedApproval = encodeProofProposalApproval(payload.proof_proposal_response.approval);
        const responseMessage = createMessage(
            safeWriteUInt32BE(code, 0),
            encodedApproval
        );
        const responseHash = await tracCryptoApi.hash.blake3(responseMessage);
        t.ok(wallet.verify(payload.proof_proposal_response.response_sig, responseHash, wallet.publicKey));

        const decoded = decodeConsensusMessage(encodeConsensusMessage(payload));
        t.is(decoded.proof_proposal_response.result, code);
        t.alike(decoded.proof_proposal_response.approval, payload.proof_proposal_response.approval);
    }
});

test('ConsensusMessageBuilder validates required inputs', async t => {
    const wallet = await createWallet();
    const fields = proofProposalFields(wallet);

    t.exception(
        () => new ConsensusMessageBuilder(null, config),
        errorMessageIncludes('Wallet must be a valid wallet object')
    );

    t.exception(
        () => new ConsensusMessageBuilder({address: 'invalid'}, config),
        errorMessageIncludes('Wallet should have a valid TRAC address.')
    );

    const builder = new ConsensusMessageBuilder(wallet, config);

    t.exception(
        () => builder.setType(undefined),
        errorMessageIncludes('Invalid consensus operation type')
    );

    t.exception(
        () => builder.setSessionId(''),
        errorMessageIncludes('Session id must be a non-empty string.')
    );

    t.exception(
        () => builder.setTimestamp(0),
        errorMessageIncludes('Timestamp must be a positive safe integer or Date.')
    );

    t.exception(
        () => builder.setProtocolVersion(-1),
        errorMessageIncludes('Protocol version must be an unsigned 32-bit integer.')
    );

    t.exception(
        () => builder.setEpoch(-1),
        errorMessageIncludes('Epoch must be a non-negative safe integer.')
    );

    t.exception(
        () => builder.setPreviousEpochRecordHash('not-a-buffer'),
        errorMessageIncludes('Previous epoch record hash must be a buffer.')
    );

    t.exception(
        () => builder.setProposer('invalid'),
        errorMessageIncludes('Proposer must be a valid TRAC address.')
    );

    t.exception(
        () => builder.setProposer(b4a.alloc(0)),
        errorMessageIncludes('Proposer must be a valid TRAC address.')
    );

    const foreignPrefixAddress = tracCryptoApi.address.encode(
        'other',
        b4a.from(testKeyPair1.publicKey, 'hex')
    );
    t.exception(
        () => builder.setProposer(foreignPrefixAddress),
        errorMessageIncludes('Proposer must be a valid TRAC address.')
    );

    t.exception(
        () => builder.setVdfParametersHash('not-a-buffer'),
        errorMessageIncludes('VDF parameters hash must be a buffer.')
    );

    t.exception(
        () => builder.setVdfProof('not-a-buffer'),
        errorMessageIncludes('VDF proof must be a buffer.')
    );

    t.exception(
        () => builder.setResultCode(67),
        errorMessageIncludes('Invalid consensus result code: 67')
    );

    t.exception(
        () => builder.setApprover('invalid'),
        errorMessageIncludes('Approver must be a valid TRAC address.')
    );

    t.exception(
        () => builder.setRequesterProofSignature('not-a-buffer'),
        errorMessageIncludes('Requester proof signature must be a buffer.')
    );

    t.exception(
        () => builder.getResult(),
        errorMessageIncludes('Header or payload not set before getResult')
    );

    const responseBuilder = new ConsensusMessageBuilder(wallet, config);
    await t.exception(
        () => setProofProposalFields(
            responseBuilder.setType(ConsensusOperationType.PROOF_PROPOSAL_RESPONSE),
            fields
        )
            .setRequesterProofSignature(fields.requesterProofSignature)
            .setApprover(wallet.address)
            .buildPayload(),
        errorMessageIncludes('Result code must be set before build.')
    );
});
