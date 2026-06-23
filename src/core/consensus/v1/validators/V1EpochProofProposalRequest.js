import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";
import {ConsensusProtocolVersion, ConsensusResultCode} from "../../../../utils/constants.js";

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


export default V1EpochProofProposalRequest;
