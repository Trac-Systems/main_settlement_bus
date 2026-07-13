import Validator from 'fastest-validator';
import b4a from 'b4a';
import {
    HASH_BYTE_LENGTH,
    ConsensusOperationType,
    SIGNATURE_BYTE_LENGTH,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE,
    PROTOCOL_VERSION_BYTE_LENGTH,
    NETWORK_ID_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH
} from '../../../../utils/constants.js';
import {V1ConsensusProtocolError} from '../V1ConsensusProtocolError.js';

const ALLOWED_RESULT_CODES = Object.values(ConsensusResultCode);

class ConsensusValidationSchema {
    #config;
    #validator;
    #validateConsensusV1ProofProposalSchema;
    #validateConsensusV1ProposalApproval;

    constructor(config) {
        this.#config = config;
        this.#validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                bufferMinLength: "The '{field}' field must be a Buffer with min length {expected}! Actual: {actual}",
                bufferMaxLength: "The '{field}' field must be a Buffer with max length {expected}! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
                emptyBuffer: "The '{field}' field must not be an empty Buffer! Actual: {actual}",
                uint64: "The '{field}' field must be an unsigned 64-bit integer! Actual: {actual}",
            },
        });
        const isBuffer = b4a.isBuffer;
        this.#validator.add("buffer", function ({schema, messages}, _path, _context) {
            const allowEmpty = schema.allowEmpty === true;
            const exactLength = Number.isInteger(schema.length) ? schema.length : null;
            const minLength = Number.isInteger(schema.min) ? schema.min : null;
            const maxLength = Number.isInteger(schema.max) ? schema.max : null;
            return {
                source:
                    `
                        if (!${isBuffer}(value)) {
                            ${this.makeError({type: "buffer", actual: "value", messages})}
                            return value;
                        }
                        const len = value.length;
                        ${exactLength === null ? '' : `
                        if (len !== ${exactLength}) {
                            ${this.makeError({type: "bufferLength", expected: exactLength, actual: "len", messages})}
                        }`}
                        ${minLength === null ? '' : `
                        if (len < ${minLength}) {
                            ${this.makeError({type: "bufferMinLength", expected: minLength, actual: "len", messages})}
                        }`}
                        ${maxLength === null ? '' : `
                        if (len > ${maxLength}) {
                            ${this.makeError({type: "bufferMaxLength", expected: maxLength, actual: "len", messages})}
                        }`}
                        if (len === 0 && !${allowEmpty}) {
                            ${this.makeError({type: "emptyBuffer", actual: "len", messages})}
                            return value;
                        }
                        let isZeroFilled = true;
                        for (let i = 0; i < len; i++) {
                            if (value[i] !== 0) {
                                isZeroFilled = false;
                                break;
                            }
                        }
                        if (isZeroFilled) {
                            ${this.makeError({type: "nonZeroBuffer", actual: "value", messages})}
                        }
                            return value;
                    `
            };
        });
        this.#validateConsensusV1ProofProposalSchema = this.#compileV1EpochProofProposalRequestSchema();
        this.#validateConsensusV1ProposalApproval = this.#compileConsensusV1ProposalApprovalSchema();
    }

    #compileV1EpochProofProposalRequestSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                integer: true,
                equal: ConsensusOperationType.PROOF_PROPOSAL,
                required: true
            },
            session_id: {type: 'string', min: 1, max: 64, required: true},
            timestamp: {type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true},
            proof_proposal: {
                strict: true,
                type: 'object',
                props: {
                    protocol_version: {type: 'buffer', length: PROTOCOL_VERSION_BYTE_LENGTH, required: true},
                    network_id: {type: 'buffer', length: NETWORK_ID_BYTE_LENGTH, required: true},
                    epoch: {type: 'buffer', length: EPOCH_BYTE_LENGTH, required: true},
                    previous_epoch_record_hash: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    proposer: {type: 'buffer', length: this.#config.addressLength, required: true},
                    vdf_parameters_hash: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    vdf_proof: {type: 'buffer', length: VDF_BLOB_PROOF_SIZE, required: true},
                    signature: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                }
            },
        };
        return this.#validator.compile(schema);
    }

    validateConsensusV1ProofProposal(operation) {
        return this.#validateConsensusV1ProofProposalSchema(operation) === true;
    }

    #compileConsensusV1ProposalApprovalSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                integer: true,
                equal: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL,
                required: true
            },
            session_id: {type: 'string', min: 1, max: 64, required: true},
            timestamp: {type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true},
            proof_proposal_response: {
                strict: true,
                type: 'object',
                props: {
                    result: {type: 'enum', values: ALLOWED_RESULT_CODES, required: true},
                    approval: {
                        strict: true,
                        type: 'object',
                        optional: true,
                        props: {
                            approver: {type: 'buffer', length: this.#config.addressLength, required: true},
                            approval_sig: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                        }
                    },
                    response_sig: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                }
            },
        };
        return this.#validator.compile(schema);
    }

    validateV1EpochProofProposalResponse(operation) {
        const isSchemaValid = this.#validateConsensusV1ProposalApproval(operation);
        if (isSchemaValid !== true) {
            throw new V1ConsensusProtocolError(
                    ConsensusResultCode.SCHEMA_VALIDATION_FAILED,
                    'Proof proposal response schema validation failed.'
            );
        }

        const response = operation.proof_proposal_response;
        if (response.result === ConsensusResultCode.OK && !response.approval) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.RESPONSE_APPROVAL_INVALID,
                'Proof proposal response approval is required when result code is OK.'
            );
        }

        if (response.result !== ConsensusResultCode.OK && response.approval) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.RESPONSE_APPROVAL_INVALID,
                'Proof proposal response approval is only allowed when result code is OK.'
            );
        }

        return true;
    }
}

export default ConsensusValidationSchema;
