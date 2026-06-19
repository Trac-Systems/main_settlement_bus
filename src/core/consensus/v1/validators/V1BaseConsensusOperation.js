import ConsensusValidationSchema from "./ConsensusValidationSchema.js";
import _ from "lodash";
import {V1ProtocolError} from "../../../network/protocols/v1/V1ProtocolError.js";
import {
    ConsensusOperationType,
    ConsensusResultCode,
    ResultCode
} from "../../../../utils/constants.js";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";

class V1BaseConsensusOperation {
    #consensusValidationSchema;

    constructor(_config) {
        this.#consensusValidationSchema = new ConsensusValidationSchema();
    }

    isPayloadSchemaValid(payload) {
        if (_.isNil(payload?.type)) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR,'Payload or payload type is missing.');
        }

        const selectedValidator = this.#selectCheckSchemaValidator(payload.type);
        const isPayloadValid = selectedValidator(payload);
        if (!isPayloadValid) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Payload is invalid.');
        }
    }

    #selectCheckSchemaValidator(type) {
        if (!Number.isInteger(type)) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Operation type must be an integer.');
        }
        if (type === 0) {
            throw new V1ConsensusProtocolError(ConsensusResultCode.UNEXPECTED_ERROR, 'Operation type is unspecified.');
        }

        switch (type) {
            case ConsensusOperationType.PROOF_PROPOSAL:
                return this.#consensusValidationSchema.validateV1LivenessRequest.bind(this.#consensusValidationSchema);
            case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL:
                return this.#consensusValidationSchema.validateV1LivenessResponse.bind(this.#consensusValidationSchema);
            default:
                throw new V1ConsensusProtocolError(ResultCode.UNEXPECTED_ERROR, `Unknown operation type: ${type}`);
        }
    }

}


export default V1BaseConsensusOperation;