import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';
import {v7 as uuidv7} from 'uuid';

import ConsensusMessageBuilder from '../../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import ConsensusMessageDirector from '../../../../src/messages/consensus/v1/ConsensusMessageDirector.js';
import {addressToBuffer} from '../../../../src/core/state/utils/address.js';
import {createMessage, safeWriteUInt32BE, uint8ToBuffer, uint16ToBuffer, uint64ToBuffer} from '../../../../src/utils/buffer.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../../src/utils/constants.js';
import {
    decodeConsensusMessage,
    encodeConsensusMessage,
    encodeProofProposalApproval
} from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {config} from '../../../helpers/config.js';
import {testKeyPair1} from '../../../fixtures/apply.fixtures.js';

async function createWallet() {
    return await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
}

test('ConsensusMessageDirector builds proof proposal and verifies signature', async t => {
    const wallet = await createWallet();
    const director = new ConsensusMessageDirector(new ConsensusMessageBuilder(wallet, config));

    const sessionId = uuidv7();
    const networkId = 67;
    const epoch = 2;
    const protocolVersionBuffer = uint8ToBuffer(ConsensusProtocolVersion.V1, 'Protocol version');
    const networkIdBuffer = uint16ToBuffer(networkId, 'Network id');
    const epochBuffer = uint64ToBuffer(epoch, 'Epoch');
    const previousEpochRecordHash = b4a.alloc(32, 1);
    const vdfParametersHash = b4a.alloc(32, 2);
    const vdfProof = b4a.alloc(VDF_BLOB_PROOF_SIZE, 3);

    const payload = await director.buildProofProposal(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        wallet.address,
        vdfParametersHash,
        vdfProof
    );

    t.is(payload.type, ConsensusOperationType.PROOF_PROPOSAL);
    t.is(payload.session_id, sessionId);
    t.ok(Number.isSafeInteger(payload.timestamp) && payload.timestamp > 0);

    const proofProposal = payload.proof_proposal;
    t.alike(proofProposal.protocol_version, protocolVersionBuffer);
    t.alike(proofProposal.network_id, networkIdBuffer);
    t.alike(proofProposal.epoch, epochBuffer);
    t.alike(proofProposal.previous_epoch_record_hash, previousEpochRecordHash);
    t.alike(proofProposal.proposer, addressToBuffer(wallet.address, config.addressPrefix));
    t.alike(proofProposal.vdf_parameters_hash, vdfParametersHash);
    t.alike(proofProposal.vdf_proof, vdfProof);
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
});

test('ConsensusMessageDirector builds proof proposal response and verifies signatures', async t => {
    const wallet = await createWallet();
    const director = new ConsensusMessageDirector(new ConsensusMessageBuilder(wallet, config));

    const sessionId = uuidv7();
    const networkId = 67;
    const epoch = 2;
    const protocolVersionBuffer = uint8ToBuffer(ConsensusProtocolVersion.V1, 'Protocol version');
    const networkIdBuffer = uint16ToBuffer(networkId, 'Network id');
    const epochBuffer = uint64ToBuffer(epoch, 'Epoch');
    const previousEpochRecordHash = b4a.alloc(32, 1);
    const vdfParametersHash = b4a.alloc(32, 2);
    const vdfProof = b4a.alloc(VDF_BLOB_PROOF_SIZE, 3);
    const requesterProofSignature = b4a.alloc(64, 4);

    const payload = await director.buildProofProposalResponse(
        sessionId,
        networkId,
        epoch,
        previousEpochRecordHash,
        wallet.address,
        vdfParametersHash,
        vdfProof,
        requesterProofSignature,
        ConsensusResultCode.OK,
        wallet.address
    );

    t.is(payload.type, ConsensusOperationType.PROOF_PROPOSAL_RESPONSE);
    t.is(payload.session_id, sessionId);
    t.ok(Number.isSafeInteger(payload.timestamp) && payload.timestamp > 0);

    const proofProposalResponse = payload.proof_proposal_response;
    t.is(proofProposalResponse.result, ConsensusResultCode.OK);
    t.alike(proofProposalResponse.approval.approver, addressToBuffer(wallet.address, config.addressPrefix));
    t.ok(b4a.isBuffer(proofProposalResponse.approval.approval_sig));
    t.ok(b4a.isBuffer(proofProposalResponse.response_sig));

    const approvalMessage = createMessage(
        protocolVersionBuffer,
        networkIdBuffer,
        epochBuffer,
        previousEpochRecordHash,
        addressToBuffer(wallet.address, config.addressPrefix),
        vdfParametersHash,
        vdfProof,
        proofProposalResponse.approval.approver,
        requesterProofSignature
    );
    const approvalHash = await tracCryptoApi.hash.blake3(approvalMessage);
    t.ok(wallet.verify(proofProposalResponse.approval.approval_sig, approvalHash, wallet.publicKey));

    const encodedApproval = encodeProofProposalApproval(proofProposalResponse.approval);
    const responseMessage = createMessage(
        safeWriteUInt32BE(ConsensusResultCode.OK, 0),
        encodedApproval
    );
    const responseHash = await tracCryptoApi.hash.blake3(responseMessage);
    t.ok(wallet.verify(proofProposalResponse.response_sig, responseHash, wallet.publicKey));

    const decoded = decodeConsensusMessage(encodeConsensusMessage(payload));
    t.is(decoded.proof_proposal_response.result, ConsensusResultCode.OK);
    t.alike(decoded.proof_proposal_response.approval, proofProposalResponse.approval);
});
