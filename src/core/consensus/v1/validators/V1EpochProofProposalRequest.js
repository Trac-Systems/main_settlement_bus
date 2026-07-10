import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";
import {ConsensusProtocolVersion, ConsensusResultCode} from "../../../../utils/constants.js";
import {createMessage, uint16ToBuffer, uint32ToBuffer} from "../../../../utils/buffer.js";
import tracCryptoApi from "trac-crypto-api";
import b4a from "b4a";
import {verifyWesolowski} from '@tracsystems/trac-vdf';

class V1EpochProofProposalRequest extends V1BaseConsensusOperation {

    /**
     * Creates the proof proposal request validator.
     *
     * @param {Config} config Application configuration. In addition to base
     * fields, request validation uses `networkId`, `vdfDifficulty`, and
     * `vdfDiscriminantSizeBits`.
     * @param {State} state Ledger state. It must expose `getCurrentEpoch()`,
     * `getEpoch(epoch)`, and `isIndexerAddress(address)`.
     * @throws {Error} When consensus schemas cannot be initialized from the configuration.
     */
    constructor(config, state) {
        super(config, state);
    }

    /**
     * Validates a complete incoming epoch proof proposal request.
     *
     * Checks the payload schema, protocol version, network id, proposer identity,
     * VDF parameters hash, proposal signature, VDF proof, next epoch number,
     * previous epoch record hash, and proposer indexer membership.
     *
     * @param {object} payload Decoded proof proposal request payload.
     * @param {object} connection Peer connection containing `remotePublicKey`.
     * @returns {Promise<boolean>} Resolves to `true` when every check succeeds.
     * @throws {V1ConsensusProtocolError} When any proposal validation check fails.
     */
    async validate(payload, connection) {
        return await this.validateAsProtocolError(async () => {
            this.isPayloadSchemaValid(payload);
            this.validateProofProposalProtocolVersion(payload.proof_proposal);
            this.validateProofProposalNetworkId(payload.proof_proposal);
            this.assertAddressWithRemotePublicKey(
                payload.proof_proposal.proposer,
                connection.remotePublicKey
            );
            await this.validateAddressIsIndexer(connection.remotePublicKey);
            await this.validateProofProposalVdfParametersHash(payload.proof_proposal);
            await this.validateSignature(payload, connection.remotePublicKey);
            await this.validateProofProposalVdfProof(payload.proof_proposal);
            const currentEpoch = await this._state.getCurrentEpoch();
            this.validateIncomingEpoch(payload.proof_proposal, currentEpoch);
            await this.validatePreviousEpochRecordHash(payload.proof_proposal, currentEpoch);
            return true;
        });
    }

    /**
     * Validates that the proof proposal uses the supported consensus protocol version.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When the version is missing or is not consensus v1.
     */
    validateProofProposalProtocolVersion(proofProposal) {
        if (!proofProposal?.protocol_version) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Proof proposal protocol version is missing.'
            );
        }

        if (proofProposal.protocol_version[0] !== ConsensusProtocolVersion.V1) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Unsupported proof proposal protocol version.'
            );
        }
    }

    /**
     * Validates that the proof proposal VDF parameters hash matches local config.
     *
     * Reconstructs the configured difficulty and discriminant-size message,
     * hashes it with BLAKE3, and compares it with `vdf_parameters_hash`.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When hashing fails or the hash does not match.
     */
    async validateProofProposalVdfParametersHash(proofProposal) {
        const message = createMessage(
            uint32ToBuffer(this._config.vdfDifficulty),
            uint16ToBuffer(this._config.vdfDiscriminantSizeBits)
        );

        let expectedHash;
        try {
            expectedHash = await tracCryptoApi.hash.blake3(message);
        } catch {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Failed to hash VDF parameters.'
            );
        }

        if (!b4a.equals(proofProposal.vdf_parameters_hash, expectedHash)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'VDF parameters hash is invalid.'
            );
        }
    }

    /**
     * Verifies the proof proposal VDF proof against its challenge data.
     *
     * Uses the canonical challenge fields and locally configured VDF difficulty
     * and discriminant size for Wesolowski proof verification.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When VDF verification fails or returns false.
     */
    async validateProofProposalVdfProof(proofProposal) {
        const challengeData = this.buildProofProposalChallengeData(proofProposal);

        let verified = false;
        try {
            verified = await verifyWesolowski(
                challengeData,
                this._config.vdfDifficulty,
                proofProposal.vdf_proof,
                this._config.vdfDiscriminantSizeBits
            );
        } catch {
            verified = false;
        }

        if (!verified) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
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
                ConsensusResultCode.UNEXPECTED_ERROR,
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
                ConsensusResultCode.UNEXPECTED_ERROR,
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
        const currentEpochHash = await this._state.getEpoch(currentEpoch);
        const epochHashInProofProposal = proofProposal.previous_epoch_record_hash;
        if (!b4a.equals(currentEpochHash, epochHashInProofProposal)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                `Previous epoch record hash mismatch for epoch ${currentEpoch}: expected ${currentEpochHash.toString('hex')}, got ${epochHashInProofProposal.toString('hex')}`
            )
        }

    }
}

export default V1EpochProofProposalRequest;
