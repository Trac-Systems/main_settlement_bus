import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";
import { V1ConsensusProtocolError } from "../V1ConsensusProtocolError.js";
import { ConsensusResultCode } from "../../../../utils/constants.js";
import { uint16ToBuffer } from "../../../../utils/buffer.js";
import b4a from "b4a";
import { verifyWesolowski } from '@tracsystems/trac-vdf';

class V1EpochProofProposalRequest extends V1BaseConsensusOperation {

    /**
     * Creates the proof proposal request validator.
     *
     * @param {Config} config Application configuration used by base validation
     * and network identity checks.
     * @param {State} state Ledger state. It must expose `requireCurrentEpoch()`,
     * `requireEpoch(epoch)`, `requireSignedConsensusConfig()`, and `isIndexerAddress(address)`.
     * @throws {Error} When consensus schemas cannot be initialized from the configuration.
     */
    constructor(config, state) {
        super(config, state);
    }

    /**
     * Validates a complete incoming epoch proof proposal request.
     *
     * Checks the payload schema, network id, proposer identity,
     * proposal signature, proposer indexer membership, next epoch number,
     * previous epoch record hash, consensus configuration, and VDF proof.
     *
     * @param {object} payload Decoded proof proposal request payload.
     * @param {object} connection Peer connection containing `remotePublicKey`.
     * @returns {Promise<boolean>} Resolves to `true` when every check succeeds.
     * @throws {V1ConsensusProtocolError} When any proposal validation check fails.
     */
    async validate(payload, connection) {
        return await this.validateAsProtocolError(async () => {
            this.isPayloadSchemaValid(payload);
            this.validateProofProposalNetworkId(payload.proof_proposal);
            this.assertAddressWithRemotePublicKey(
                payload.proof_proposal.proposer,
                connection.remotePublicKey
            );
            await this.validateSignature(payload, connection.remotePublicKey, undefined, ConsensusResultCode.PROPOSAL_SIGNATURE_INVALID);
            await this.validateAddressIsIndexer(connection.remotePublicKey);
            this.validateLocalNodeIsIndexer();
            const currentEpoch = await this._state.requireCurrentEpoch();
            this.validateIncomingEpoch(payload.proof_proposal, currentEpoch);
            await this.validatePreviousEpochRecordHash(payload.proof_proposal, currentEpoch);
            await this.validateProofProposalConfig(payload.proof_proposal);
            await this.validateProofProposalVdfProof(payload.proof_proposal);
            return true;
        });
    }

    /**
     * Validates that the proof proposal VDF parameters match signed consensus state.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When the proposal parameters do not match consensus state.
     */
    async validateProofProposalConfig(proofProposal) {
        const consensusConfig = await this._state.requireSignedConsensusConfig();

        const difficulty = proofProposal.difficulty.readUInt32BE(0);
        const discriminantBitSize =
            proofProposal.discriminant_bit_size.readUInt16BE(0);

        if (
            difficulty !== consensusConfig.configData.difficulty ||
            discriminantBitSize !== consensusConfig.configData.discriminantBitSize
        ) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.CONSENSUS_CONFIG_MISMATCH,
                'Proof proposal does not match the current consensus configuration.'
            );
        }
    }

    /**
     * Verifies the proof proposal VDF proof against its challenge data.
     *
     * Uses the canonical challenge fields and signed-state VDF difficulty and
     * discriminant size for Wesolowski proof verification.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When VDF verification fails or returns false.
     */
    async validateProofProposalVdfProof(proofProposal) {
        const challengeData = this.buildProofProposalChallengeData(proofProposal);
        const difficulty = proofProposal.difficulty.readUInt32BE(0);
        const discriminantBitSize = proofProposal.discriminant_bit_size.readUInt16BE(0);

        let verified = false;
        try {
            verified = await verifyWesolowski(
                challengeData,
                difficulty,
                proofProposal.proof,
                discriminantBitSize
            );
        } catch {
            verified = false;
        }

        if (!verified) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.VDF_PROOF_INVALID,
                'VDF proof is invalid.'
            );
        }
    }

    /**
     * Validates that the proof proposal targets the configured network.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When `network_id` differs from the local network id.
     */
    validateProofProposalNetworkId(proofProposal) {
        const expectedNetworkId = uint16ToBuffer(this._config.networkId);
        if (!b4a.equals(proofProposal.network_id, expectedNetworkId)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.WRONG_NETWORK_ID,
                'Invalid proof proposal network id.'
            );
        }
    }

    /**
     * Validates that the proposal advances the current epoch by exactly one.
     *
     * @param {object} proofProposal Decoded proof proposal containing an uint64 epoch buffer.
     * @param {bigint} currentEpoch Current epoch snapshot used by all epoch-related checks.
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When the proposed epoch is not `currentEpoch + 1`.
     */
    validateIncomingEpoch(proofProposal, currentEpoch) {
        const proofProposalEpoch = proofProposal.epoch.readBigUInt64BE(0);
        if (proofProposalEpoch !== currentEpoch + 1n) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.EPOCH_INVALID,
                `Unexpected epoch. Proof proposal must be ${currentEpoch + 1n} but got ${proofProposalEpoch}`
            );
        }
    }

    /**
     * Validates that the proposal references the current epoch record hash.
     *
     * Reads the current epoch id and its stored hash, then compares that hash
     * with `previous_epoch_record_hash` from the proposal.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @param {bigint} currentEpoch Current epoch snapshot used by all epoch-related checks.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When the previous epoch record hash does not match state.
     */
    async validatePreviousEpochRecordHash(proofProposal, currentEpoch) {
        const currentEpochHash = await this._state.requireEpoch(currentEpoch);
        const epochHashInProofProposal = proofProposal.previous_epoch_record_hash;
        if (!b4a.equals(currentEpochHash, epochHashInProofProposal)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.PREVIOUS_EPOCH_RECORD_HASH_INVALID,
                `Previous epoch record hash mismatch for epoch ${currentEpoch}: expected ${currentEpochHash.toString('hex')}, got ${epochHashInProofProposal.toString('hex')}`
            );
        }

    }
}

export default V1EpochProofProposalRequest;
