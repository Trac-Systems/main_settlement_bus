import Validator from 'fastest-validator';
import b4a from 'b4a';
import {
    HASH_BYTE_LENGTH,
    NetworkOperationType,
    PUBLIC_KEY_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    ResultCode
} from '../../../../utils/constants.js';

const ALLOWED_RESULT_CODES = Object.values(ResultCode);

class ConsensusValidationSchema {
    #validator;
    #validateV1EpochProofProposalRequest;
    #validateV1EpochProofProposalResponse;

    constructor() {
        this.#validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                bufferMinLength: "The '{field}' field must be a Buffer with min length {expected}! Actual: {actual}",
                bufferMaxLength: "The '{field}' field must be a Buffer with max length {expected}! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
                emptyBuffer: "The '{field}' field must not be an empty Buffer! Actual: {actual}",
            },
        });
        const isBuffer = b4a.isBuffer;
        this.#validator.add("buffer", function ({schema, messages}, _path, _context) {
            const allowZero = schema.allowZero === true;
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
                        if (!${allowZero}) {
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
                        }
                            return value;
                    `
            };
        });

        this.#validateV1EpochProofProposalRequest = this.#compileV1EpochProofProposalRequestSchema();
        this.#validateV1EpochProofProposalResponse = this.#compileV1EpochProofProposalResponseSchema();
    }

    #compileV1EpochProofProposalRequestSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                integer: true,
                equal: NetworkOperationType.EPOCH_PROOF_PROPOSAL_REQUEST,
                required: true
            },
            id: {type: 'string', min: 1, max: 64, required: true},
            timestamp: {type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true},
            epoch_proof_proposal_request: {
                strict: true,
                type: 'object',
                props: {
                    data: {
                        strict: true,
                        type: 'object',
                        props: {
                            protocol_version: {type: 'number', integer: true, min: 0, max: 255, required: true},
                            epoch: {type: 'number', integer: true, min: 0, max: Number.MAX_SAFE_INTEGER, required: true},
                            previous_epoch_hash: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                            committed_hash: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                            // leader_id: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                            vdf_parameters_hash: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                            vdf_output: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                        }
                    },
                    hash: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    signature: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                }
            },
            capabilities: {type: 'array', items: 'string', required: true},
        };
        return this.#validator.compile(schema);
    }

    validateV1EpochProofProposalRequest(operation) {
        return this.#validateV1EpochProofProposalRequest(operation) === true;
    }

    #compileV1EpochProofProposalResponseSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                integer: true,
                equal: NetworkOperationType.EPOCH_PROOF_PROPOSAL_RESPONSE,
                required: true
            },
            id: {type: 'string', min: 1, max: 64, required: true},
            timestamp: {type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true},
            epoch_proof_proposal_response: {
                strict: true,
                type: 'object',
                props: {
                    approver: {type: 'buffer', length: PUBLIC_KEY_LENGTH, required: true},
                    signature: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                    result: {type: 'enum', values: ALLOWED_RESULT_CODES, required: true},
                }
            },
            capabilities: {type: 'array', items: 'string', required: true},
        };
        return this.#validator.compile(schema);
    }

    validateV1EpochProofProposalResponse(operation) {
        return this.#validateV1EpochProofProposalResponse(operation) === true;
    }
}

export default ConsensusValidationSchema;
