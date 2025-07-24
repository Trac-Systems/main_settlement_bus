import Validator from 'fastest-validator';
import { OperationType,
    WRITER_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    MIN_SAFE_VALIDATION_INTEGER,
    MAX_SAFE_VALIDATION_INTEGER,
    TX_HASH_HEXSTRING_LENGTH,
    WRITING_KEY_HEXSTRING_LENGTH,
    NONCE_HEXSTRING_LENGTH,
    CONTENT_HASH_HEXSTRING_LENGTH,
    SIGNATURE_HEXSTRING_LENGTH,
    BOOTSTRAP_HEXSTRING_LENGTH
} from './constants.js';
import { TRAC_ADDRESS_SIZE } from '../core/state/ApplyOperationEncodings.js'
import b4a from 'b4a';
class Check {
    #validator;
    #validateExtendedKeyOp;
    #validateBasicKeyOp;
    #validatePreTx;
    #validatePostTx;
    constructor() {

        this.#validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
                emptyBuffer: "The '{field}' field must not be an empty Buffer!",
            },
        });
        const isBuffer = b4a.isBuffer;
        this.#validator.add("buffer", function ({ schema, messages }, path, context) {
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

        this.#validateExtendedKeyOp = this.#compileExtendedKeyOpSchema();
        this.#validateBasicKeyOp = this.#compileBasicKeyOpSchema();
        this.#validatePreTx = this.#compilePreTxSchema();
        this.#validatePostTx = this.#compilePostTxSchema();
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
        return this.#validator.compile(schema);
    }

    validateExtendedKeyOpSchema(op) {
        return this.#validateExtendedKeyOp(op) === true;
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
        return this.#validator.compile(schema);
    }

    validateBasicKeyOp(op) {
        return this.#validateBasicKeyOp(op) === true;
    }
    #compilePreTxSchema() {
        const schema = {
            $$strict: true,
            op: { type: 'string', enum: [OperationType.PRE_TX], required: true }, // Operation type (must be 'pre-tx')
            tx: { type: 'string', length: TX_HASH_HEXSTRING_LENGTH, required: true, hex: true }, // Transaction hash (unique identifier for the transaction)
            ia: { type: 'string', length: TRAC_ADDRESS_SIZE, required: true }, // Address of the requesting node (used for signature verification)
            iw: { type: 'string', length: WRITING_KEY_HEXSTRING_LENGTH, required: true, hex: true }, // Writing key of the requesting node (external subnetwork)
            in: { type: 'string', length: NONCE_HEXSTRING_LENGTH, required: true, hex: true }, // Nonce of the requesting node
            ch: { type: 'string', length: CONTENT_HASH_HEXSTRING_LENGTH, required: true, hex: true }, // Content hash (hash of the transaction's data)
            is: { type: 'string', length: SIGNATURE_HEXSTRING_LENGTH, required: true, hex: true }, // Requester's signature
            bs: { type: 'string', length: BOOTSTRAP_HEXSTRING_LENGTH, required: true, hex: true }, // External bootstrap contract
            mbs: { type: 'string', length: BOOTSTRAP_HEXSTRING_LENGTH, required: true, hex: true }, // MSB bootstrap key
            va: { type: 'string', length: TRAC_ADDRESS_SIZE, required: true }, // Validator address (used for validation)
        };
        return this.#validator.compile(schema);
    }

    validatePreTx(op) {
        return this.#validatePreTx(op) === true;
    }

    #compilePostTxSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.TX], positive: true, integer: true, min: MIN_SAFE_VALIDATION_INTEGER, max: MAX_SAFE_VALIDATION_INTEGER, required: true },
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
        return this.#validator.compile(schema);
    }

    validatePostTx(op) {
        return this.#validatePostTx(op) === true;
    }
}
export default Check;
