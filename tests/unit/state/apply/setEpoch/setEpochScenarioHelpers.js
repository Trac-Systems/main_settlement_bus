
import b4a from 'b4a';
import { v7 as uuidv7 } from 'uuid';
import { setupAdminNetwork } from '../common/commonScenarioHelper.js';
import { deriveIndexerSequenceState, eventFlush } from '../../../../helpers/autobaseTestHelpers.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import { consensusMessageFactory } from '../../../../../src/messages/consensus/v1/consensusMessageFactory.js';
import {
    unsafeDecodeApplyOperation,
    encodeApplyOperation,
    encodeConsensusConfig
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { encodeVdfConfig } from '../../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import {
    encodeProofProposal,
    encodeProofProposalApproval
} from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { addressToBuffer } from '../../../../../src/core/state/utils/address.js';
import { EntryType, ConsensusResultCode, ConsensusProtocolVersion } from '../../../../../src/utils/constants.js';
import { uint16ToBuffer, uint32ToBuffer, uint64ToBuffer, uint8ToBuffer, createMessage } from '../../../../../src/utils/buffer.js';
import { config } from '../../../../helpers/config.js';

const isBare = typeof globalThis.Bare !== 'undefined';

// Difficulty is kept tiny so real VDF computation stays fast in tests, but the discriminant
// size must be 2048 bits: that's the only size whose solution matches the protocol's fixed
// 516-byte VDF_BLOB_PROOF_SIZE wire format (verified empirically: 512->132B, 1024->260B, 2048->516B).
export const VDF_DIFFICULTY = 100;
export const VDF_DISCRIMINANT_SIZE = 2048;

export async function computeRealVdfSolution(challenge) {
    const Service = isBare
        ? (await import('../../../../../src/core/consensus/services/VDFBare.js')).VDFBare
        : (await import('../../../../../src/core/consensus/services/VDFNode.js')).VDFNode;

    const service = new Service();
    await service.ready();
    try {
        const { result, error } = await service.calculateVDF(challenge, VDF_DIFFICULTY, VDF_DISCRIMINANT_SIZE);
        if (error) {
            throw new Error(`VDF computation failed in test helper (is @tracsystems/trac-vdf built?): ${error}`);
        }
        return b4a.from(result.solution);
    } finally {
        await service.close();
    }
}

/**
 * Boots an admin network. The bootstrap/admin node is always a real, ledger-registered,
 * sole indexer (via the real ADD_ADMIN operation setupAdminNetwork already performs and the
 * bootstrap-indexer seeding it does), then initializes the genesis epoch.
 *
 * All SET_EPOCH payloads built from this scenario are appended and proposed by this single
 * admin/bootstrap node, which - being the only indexer - always satisfies quorum (threshold 1)
 * on its own verified signature. A genuine multi-indexer quorum (threshold > 1, requiring an
 * external approval) would need real multi-node Autobase replication to observe reliably:
 * base.system.indexers on a single base does not settle a second sequential ADD_INDEXER
 * without a full sync round once any real indexer promotion has happened, and syncing mid-way
 * through further real appends destabilizes this lightweight harness. That scenario is better
 * covered once the EpochCoordinatorService integration/e2e tests exist with real replication.
 */
export async function setupSetEpochScenario(t) {
    const context = await setupAdminNetwork(t, { nodes: 2 });
    await initializeGenesisEpoch(context);
    context.setEpochScenario = { indexerPeers: [context.adminBootstrap] };
    return context;
}

async function initializeGenesisEpoch(context) {
    const adminNode = context.adminBootstrap;
    const txValidity = await deriveIndexerSequenceState(adminNode.base);
    const configData = encodeVdfConfig({
        difficulty: uint32ToBuffer(VDF_DIFFICULTY),
        discriminantBitSize: uint16ToBuffer(VDF_DISCRIMINANT_SIZE)
    });
    const encodedConsensusConfig = encodeConsensusConfig({
        sv: uint8ToBuffer(1),
        cd: configData
    });
    const payload = await applyStateMessageFactory(adminNode.wallet, config)
        .buildCompleteSetGenesisEpochMessage(
            adminNode.wallet.address,
            txValidity,
            encodedConsensusConfig
        );
    await appendAndUpdate(adminNode.base, encodeApplyOperation(payload));
}

export async function appendAndUpdate(base, payload) {
    await base.append(payload);
    await base.update();
    await eventFlush();
}

export async function getEpochHash(base, epoch) {
    const entry = await base.view.get(EntryType.EPOCH + epoch.toString());
    return entry?.value ?? null;
}

export async function getCurrentEpoch(base) {
    const entry = await base.view.get(EntryType.EPOCH_CURRENT);
    return entry ? entry.value.readBigUInt64BE(0) : null;
}

/**
 * Builds a fully valid, cryptographically real SET_EPOCH apply payload: a signed proof
 * proposal from `proposerNode` plus signed approvals from `approverNodes`, exactly mirroring
 * the production EpochCoordinatorOperations.createProofProposal/appendEpoch flow.
 */
export async function buildSetEpochPayload(context, {
    proposerNode = context.adminBootstrap,
    approverNodes,
    epoch = 1n,
    previousEpochHash = null,
    vdfDifficulty = VDF_DIFFICULTY,
    vdfDiscriminantSize = VDF_DISCRIMINANT_SIZE,
    challengeOverride = null,
    proposalSignatureOverride = null,
} = {}) {
    const resolvedApprovers = approverNodes ?? context.setEpochScenario.indexerPeers.filter(
        peer => peer.wallet.address !== proposerNode.wallet.address
    );

    const base = proposerNode.base;
    const prevHash = previousEpochHash ?? await getEpochHash(base, epoch - 1n);
    if (!prevHash) {
        throw new Error('buildSetEpochPayload requires an initialized previous epoch hash.');
    }

    const difficulty = uint32ToBuffer(vdfDifficulty);
    const discriminantBitSize = uint16ToBuffer(vdfDiscriminantSize);

    // Must match the 7-field challenge State#handleApplySetEpochOperation reconstructs
    // (protocol_version, network_id, epoch, previous_epoch_record_hash, proposer,
    // difficulty, discriminant_bit_size)
    // - the VDF proof is only valid against this exact canonical challenge, not the raw previous hash alone.
    const challengeData = createMessage(
        uint8ToBuffer(ConsensusProtocolVersion.V1),
        uint16ToBuffer(config.networkId),
        uint64ToBuffer(epoch),
        prevHash,
        addressToBuffer(proposerNode.wallet.address, config.addressPrefix),
        difficulty,
        discriminantBitSize
    );

    const challenge = challengeOverride ?? challengeData;
    const vdfSolution = await computeRealVdfSolution(challenge);

    const proposalMessage = await consensusMessageFactory(proposerNode.wallet, config)
        .buildProofProposal(
            uuidv7(),
            config.networkId,
            epoch,
            prevHash,
            proposerNode.wallet.address,
            difficulty,
            discriminantBitSize,
            vdfSolution
        );
    const proofProposal = { ...proposalMessage.proof_proposal };
    if (proposalSignatureOverride) {
        proofProposal.signature = proposalSignatureOverride;
    }

    const approvals = [];
    for (const approverNode of resolvedApprovers) {
        const responseMessage = await consensusMessageFactory(approverNode.wallet, config)
            .buildProofProposalResponse(
                uuidv7(),
                config.networkId,
                epoch,
                prevHash,
                proposerNode.wallet.address,
                difficulty,
                discriminantBitSize,
                vdfSolution,
                proofProposal.signature,
                ConsensusResultCode.OK,
                approverNode.wallet.address
            );
        approvals.push(responseMessage.proof_proposal_response.approval);
    }

    const proofData = encodeProofProposal(proofProposal);
    const encodedApprovals = approvals.map(approval => encodeProofProposalApproval(approval));

    const message = await applyStateMessageFactory(proposerNode.wallet, config)
        .buildCompleteSetEpochMessage(proposerNode.wallet.address, proofData, encodedApprovals);

    return encodeApplyOperation(message);
}

export function decodeSetEpochPayload(payload) {
    return unsafeDecodeApplyOperation(payload);
}
