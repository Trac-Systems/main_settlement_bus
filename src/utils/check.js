import Validator from 'fastest-validator';
import { OperationType, ADDRESS_BYTE_LENGTH, WRITER_BYTE_LENGTH, NONCE_BYTE_LENGTH, SIGNATURE_BYTE_LENGTH, HASH_BYTE_LENGTH, MIN_SAFE_VALIDATION_INTEGER, MAX_SAFE_VALIDATION_INTEGER } from './constants.js';
import { TRAC_ADDRESS_SIZE } from '../core/state/ApplyOperationEncodings.js'
import b4a from 'b4a';
class Check {
    #_validator;
    #_validateExtendedKeyOp;
    #_validateBasicKeyOp;
    #_validatePreTx;
    #_validatePostTx;
    constructor() {

        this.#_validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
                emptyBuffer: "The '{field}' field must not be an empty Buffer!",
            },
        });
        const isBuffer = b4a.isBuffer;
        this.#_validator.add("buffer", function ({ schema, messages }, path, context) {
            return {
                source:
                    `
                        if (!${isBuffer}(value)) {
                            ${this.makeError({ type: "buffer", actual: "value", messages })}
                        }
                        if (value.length !== ${schema.length}) {
                            ${this.makeError({ type: "bufferLength", expected: schema.length, actual: "value.length", messages })}
                        }
                        let isEmpty = true;
                            for (let i = 0; i < value.length; i++) {
                                if (value[i] !== 0) {
                                    isEmpty = false;
                                    break;
                                }
                            }
                            if (isEmpty) {
                                ${this.makeError({ type: "emptyBuffer", actual: "value", messages })}
                            }
                            return value;
                    `
            };
        });

        this.#_validateExtendedKeyOp = this.#compileExtendedKeyOpSchema();
        this.#_validateBasicKeyOp = this.#compileBasicKeyOpSchema();
        this.#_validatePreTx = this.#compilePreTxSchema();
        this.#_validatePostTx = this.#compilePostTxSchema();
    }

    #compileExtendedKeyOpSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.ADD_ADMIN, OperationType.ADD_WRITER, OperationType.REMOVE_WRITER], positive: true, integer: true, min: MIN_SAFE_VALIDATION_INTEGER, max: MAX_SAFE_VALIDATION_INTEGER, required: true },
            address: { type: 'buffer', length: TRAC_ADDRESS_SIZE, required: true },
            eko: {
                strict: true,
                type: 'object',
                props: {
                    wk: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true },
                    nonce: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true },
                    sig: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                }
            }
        };
        return this.#_validator.compile(schema);
    }

    validateExtendedKeyOpSchema(op) {
        return this.#_validateExtendedKeyOp(op) === true;
    }

    #compileBasicKeyOpSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.ADD_INDEXER, OperationType.REMOVE_INDEXER, OperationType.APPEND_WHITELIST, OperationType.BAN_VALIDATOR], positive: true, integer: true, min: MIN_SAFE_VALIDATION_INTEGER, max: MAX_SAFE_VALIDATION_INTEGER, required: true },
            address: { type: 'buffer', length: TRAC_ADDRESS_SIZE, required: true },
            bko: {
                strict: true,
                type: 'object',
                props: {
                    nonce: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true, },
                    sig: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                }
            }
        }
        return this.#_validator.compile(schema);
    }

    validateBasicKeyOp(op) {
        return this.#_validateBasicKeyOp(op) === true;
    }
    //TODO: create constants.
    #compilePreTxSchema() {
        const schema = {
            $$strict: true,
            op: { type: 'string', enum: ['pre-tx'], required: true }, // Operation type (must be 'pre-tx')
            tx: { type: 'string', length: 64, required: true, hex: true }, // Transaction hash (unique identifier for the transaction)
            ia: { type: 'string', length: TRAC_ADDRESS_SIZE, required: true }, // Address of the requesting node (used for signature verification)
            iw: { type: 'string', length: 64, required: true, hex: true }, // Writing key of the requesting node (external subnetwork)
            in: { type: 'string', length: 64, required: true, hex: true }, // Nonce of the requesting node
            ch: { type: 'string', length: 64, required: true, hex: true }, // Content hash (hash of the transaction's data)
            is: { type: 'string', length: 128, required: true, hex: true }, // Requester's signature
            bs: { type: 'string', length: 64, required: true, hex: true }, // External bootstrap contract
            mbs: { type: 'string', length: 64, required: true, hex: true }, // MSB bootstrap key
            va: { type: 'string', length: TRAC_ADDRESS_SIZE, required: true }, // Validator address (used for validation)
        };
        return this.#_validator.compile(schema);
    }

    validatePreTx(op) {
        return this.#_validatePreTx(op) === true;
    }

    #compilePostTxSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.POST_TX], positive: true, integer: true, min: MIN_SAFE_VALIDATION_INTEGER, max: MAX_SAFE_VALIDATION_INTEGER, required: true },
            address: { type: 'buffer', length: TRAC_ADDRESS_SIZE, required: true }, // validator address
            txo: {
                strict: true,
                type: "object",
                props: {
                    tx: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true }, // tx hash
                    ia: { type: 'buffer', length: TRAC_ADDRESS_SIZE, required: true }, // incoming address
                    iw: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true }, // incoming writer key
                    in: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true }, // incoming nonce
                    ch: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true }, // content hash
                    is: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true }, // signature
                    bs: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true }, // peer contract bootstrap
                    mbs: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true }, // msb bootstrap
                    vs: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true }, // validator/writer signature
                    vn: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true } // validator/writer nonce
                }
            }
        };
        return this.#_validator.compile(schema);
    }

    validatePostTx(op) {
        return this.#_validatePostTx(op) === true;
    }
}
export default Check;
