import { test } from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import { v7 as uuidv7 } from 'uuid';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import ConsensusMessageDirector from '../../../src/messages/consensus/v1/ConsensusMessageDirector.js';
import {
    buildProofProposalApprovalSignatureMessage,
    buildProofProposalResponseSignatureMessage,
    buildProofProposalSignatureMessage,
    hashProofProposal,
    hashProofProposalApproval,
    hashProofProposalResponse,
    verifyProofProposalApprovalSignature,
    verifyProofProposalResponseSignature,
    verifyProofProposalSignature
} from '../../../src/utils/consensus/v1/epochProofProposalSignatureUtils.js';
import { createMessage, safeWriteUInt32BE } from '../../../src/utils/buffer.js';
import {
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import { encodeProofProposalApproval } from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';

async function createWallet(keyPair) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildProposal(wallet, overrides = {}) {
    const director = new ConsensusMessageDirector(new ConsensusMessageBuilder(wallet, config));
    return await director.buildProofProposal(
        overrides.sessionId ?? uuidv7(),
        overrides.networkId ?? config.networkId,
        overrides.epoch ?? 2,
        overrides.previousEpochRecordHash ?? b4a.alloc(32, 1),
        wallet.address,
        overrides.vdfParametersHash ?? b4a.alloc(32, 2),
        overrides.vdfProof ?? b4a.alloc(VDF_BLOB_PROOF_SIZE, 3)
    );
}

async function buildResponse(
    wallet,
    proofProposalPayload,
    proposerAddress,
    resultCode = ConsensusResultCode.OK
) {
    const proofProposal = proofProposalPayload.proof_proposal;
    const director = new ConsensusMessageDirector(new ConsensusMessageBuilder(wallet, config));
    return await director.buildProofProposalResponse(
        proofProposalPayload.session_id,
        proofProposal.network_id.readUInt16BE(0),
        proofProposal.epoch.readBigUInt64BE(0),
        proofProposal.previous_epoch_record_hash,
        proposerAddress,
        proofProposal.vdf_parameters_hash,
        proofProposal.vdf_proof,
        proofProposal.signature,
        resultCode,
        wallet.address
    );
}

function tamperFirstByte(buffer) {
    const tampered = b4a.from(buffer);
    tampered[0] ^= 0xff;
    return tampered;
}

test('proof proposal signature helpers build and verify proposal signatures', async t => {
    const leaderWallet = await createWallet(testKeyPair1);
    const proposalPayload = await buildProposal(leaderWallet);
    const proofProposal = proposalPayload.proof_proposal;

    const manualMessage = createMessage(
        proofProposal.protocol_version,
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.vdf_parameters_hash,
        proofProposal.vdf_proof
    );
    const manualHash = await tracCryptoApi.hash.blake3(manualMessage);

    t.alike(buildProofProposalSignatureMessage(proofProposal), manualMessage);
    t.alike(await hashProofProposal(proofProposal), manualHash);
    t.ok(await verifyProofProposalSignature(proofProposal));

    const tamperedProposal = {
        ...proofProposal,
        vdf_proof: tamperFirstByte(proofProposal.vdf_proof)
    };
    t.is(await verifyProofProposalSignature(tamperedProposal), false);
});

test('proof proposal signature helpers build and verify approval signatures', async t => {
    const leaderWallet = await createWallet(testKeyPair1);
    const minionWallet = await createWallet(testKeyPair2);
    const proposalPayload = await buildProposal(leaderWallet);
    const responsePayload = await buildResponse(minionWallet, proposalPayload, leaderWallet.address);
    const proofProposal = proposalPayload.proof_proposal;
    const approval = responsePayload.proof_proposal_response.approval;

    const manualMessage = createMessage(
        proofProposal.protocol_version,
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.vdf_parameters_hash,
        proofProposal.vdf_proof,
        approval.approver,
        proofProposal.signature
    );
    const manualHash = await tracCryptoApi.hash.blake3(manualMessage);

    t.alike(
        buildProofProposalApprovalSignatureMessage(proofProposal, approval.approver),
        manualMessage
    );
    t.alike(
        await hashProofProposalApproval(proofProposal, approval.approver),
        manualHash
    );
    t.ok(await verifyProofProposalApprovalSignature(proofProposal, approval));

    const tamperedApproval = {
        ...approval,
        approval_sig: tamperFirstByte(approval.approval_sig)
    };
    t.is(
        await verifyProofProposalApprovalSignature(proofProposal, tamperedApproval),
        false
    );
});

test('proof proposal signature helpers build and verify response signatures', async t => {
    const leaderWallet = await createWallet(testKeyPair1);
    const minionWallet = await createWallet(testKeyPair2);
    const proposalPayload = await buildProposal(leaderWallet);
    const responsePayload = await buildResponse(minionWallet, proposalPayload, leaderWallet.address);
    const response = responsePayload.proof_proposal_response;

    const encodedApproval = encodeProofProposalApproval(response.approval);
    const manualMessage = createMessage(
        safeWriteUInt32BE(response.result, 0),
        encodedApproval
    );
    const manualHash = await tracCryptoApi.hash.blake3(manualMessage);

    t.alike(
        buildProofProposalResponseSignatureMessage(response.result, response.approval),
        manualMessage
    );
    t.alike(
        await hashProofProposalResponse(response.result, response.approval),
        manualHash
    );
    t.ok(await verifyProofProposalResponseSignature(response));

    const tamperedResponse = {
        ...response,
        response_sig: tamperFirstByte(response.response_sig)
    };
    t.is(await verifyProofProposalResponseSignature(tamperedResponse), false);
    t.is(
        await verifyProofProposalResponseSignature(response, b4a.from(testKeyPair1.publicKey, 'hex')),
        false
    );
});
