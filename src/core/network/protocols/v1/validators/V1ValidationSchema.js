import Validator from 'fastest-validator';
import b4a from 'b4a';
import {NetworkOperationType, NONCE_BYTE_LENGTH, SIGNATURE_BYTE_LENGTH} from '../../../../../utils/constants.js';

class V1ValidationSchema {
    #validator;
    #validateV1LivenessRequst
    #config

    /**
     * @param {object} config
     **/
    constructor(config) {
        this.#config = config

        this.#validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                emptyBuffer: "The '{field}' field must not be an empty Buffer!",
            },
        });
        const isBuffer = b4a.isBuffer;
        this.#validator.add("buffer", function ({schema, messages}, path, context) {
            return {
                source:
                    `
                        if (!${isBuffer}(value)) {
                            ${this.makeError({type: "buffer", actual: "value", messages})}
                        }
                        if (value.length !== ${schema.length}) {
                            ${this.makeError({
                        type: "bufferLength",
                        expected: schema.length,
                        actual: "value.length",
                        messages
                    })}
                        }
                        let isEmpty = true;
                            for (let i = 0; i < value.length; i++) {
                                if (value[i] !== 0) {
                                    isEmpty = false;
                                    break;
                                }
                            }
                            if (isEmpty) {
                                ${this.makeError({type: "emptyBuffer", actual: "value", messages})}
                            }
                            return value;
                    `
            };
        });

        this.#validateV1LivenessRequst= this.#compileV1LivenessRequestSchema();
    }

    #compileV1LivenessRequestSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                required: true,
                custom: (value, errors) => {
                    const allowedTypes = [
                        NetworkOperationType.LIVENESS_REQUEST
                    ];

                    if (!allowedTypes.includes(value)) {
                        errors.push({
                            type: 'valueNotAllowed',
                            actual: value,
                            expected: allowedTypes,
                            field: 'type',
                            message: `Operation type must be: ${allowedTypes.join(', ')}`
                        });
                    }
                    return value;
                }
            },
            id: { type: 'string', min: 1, max: 64, required: true },
            timestamp: { type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true },
            liveness_request: {
                strict: true,
                type: 'object',
                props: {
                    nonce: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    signature: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                }
            },
            capabilities: { type: 'array', items: 'string', required: true },

        };
        return this.#validator.compile(schema);
    }

    validateV1LivenessRequest(operation) {
        return this.#validateV1LivenessRequst(operation) === true;
    }



}

export default V1ValidationSchema;

