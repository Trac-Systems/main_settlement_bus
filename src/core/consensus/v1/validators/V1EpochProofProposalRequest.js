import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";
import {ConsensusProtocolVersion, ConsensusResultCode} from "../../../../utils/constants.js";
import {createMessage, safeWriteUInt32BE} from "../../../../utils/buffer.js";
import tracCryptoApi from "trac-crypto-api";
import b4a from "b4a";
import {verifyWesolowski} from '@tracsystems/trac-vdf';

class V1EpochProofProposalRequest extends V1BaseConsensusOperation {
    #config;

    /**
     * Creates the proof proposal request validator.
     */
    constructor(config) {
        super(config);
        this.#config = config;
    }

    /**
     * Validates proof proposal request schema and proposer signature.
     */
    async validate(payload, connection) {
        this.isPayloadSchemaValid(payload);
        this.validateProofProposalProtocolVersion(payload.proof_proposal);
        this.assertAddressWithRemotePublicKey(payload.proof_proposal.proposer, connection.remotePublicKey, "Proposer");
        await this.validateProofProposalVdfParametersHash(payload.proof_proposal);
        await this.validateProofProposalVdfProof(payload.proof_proposal);
        await this.validateSignature(payload, connection.remotePublicKey);
    }

    /**
     * Validates that the proof proposal uses the supported consensus protocol version.
     */
    validateProofProposalProtocolVersion(proofProposal) {
        if (!proofProposal?.protocol_version) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Proof proposal protocol version is missing.');
        }

        if (proofProposal.protocol_version[0] !== ConsensusProtocolVersion.V1) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Unsupported proof proposal protocol version.');
        }
    }

    /**
     * Validates that the proof proposal VDF parameters hash matches local config.
     */
    async validateProofProposalVdfParametersHash(proofProposal) {
        const message = createMessage(
            safeWriteUInt32BE(this.#config.vdfDifficulty, 0),
            safeWriteUInt32BE(this.#config.vdfDiscriminantSizeBits, 0)
        );

        let expectedHash;
        try {
            expectedHash = await tracCryptoApi.hash.blake3(message);
        } catch {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Failed to hash VDF parameters.');
        }

        if (!b4a.equals(proofProposal.vdf_parameters_hash, expectedHash)) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'VDF parameters hash is invalid.');
        }
    }

    /**
     * Verifies the proof proposal VDF proof against its challenge data.
     */
    async validateProofProposalVdfProof(proofProposal) {
        const challengeData = this.buildProofProposalChallengeData(proofProposal);

        let verified = false;
        try {
            verified = await verifyWesolowski(
                challengeData,
                this.#config.vdfDifficulty,
                proofProposal.vdf_proof,
                this.#config.vdfDiscriminantSizeBits
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
}

export default V1EpochProofProposalRequest;
