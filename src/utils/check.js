import Validator from 'fastest-validator';
import { OperationType, ADDRESS_BYTE_LENGTH, WRITER_BYTE_LENGTH, NONCE_BYTE_LENGTH, SIGNATURE_BYTE_LENGTH, HASH_BYTE_LENGTH } from './constants.js';
import b4a from 'b4a';
class Check {
    #_validator;
    #_sanitizeExtendedKeyOp;
    #_sanitizeBasicKeyOp;
    #_sanitizePreTx;
    #_sanitizePostTx;
    constructor() {

        this.#_validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
            },
        });
        const isBufferReference = b4a.isBuffer;
        this.#_validator.add("buffer", function ({ schema, messages }, path, context) {
            return {
                source:
                    `   
                    if (!${isBufferReference}(value)) {
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

        this.#_sanitizeExtendedKeyOp = this.#compileExtendedKeyOpSchema();
        this.#_sanitizeBasicKeyOp = this.#compileBasicKeyOpSchema();
        this.#_sanitizePreTx = this.#compilePreTxSchema();
        this.#_sanitizePostTx = this.#compilePostTxSchema();
    }

    #compileExtendedKeyOpSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.ADD_ADMIN, OperationType.ADD_WRITER, OperationType.REMOVE_WRITER], positive: true, integer: true, min: 1, max: 4294967295, required: true },
            key: { type: 'buffer', length: ADDRESS_BYTE_LENGTH, required: true },
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

    sanitizeExtendedKeyOpSchema(op) {
        return this.#_sanitizeExtendedKeyOp(op) === true;
    }

    #compileBasicKeyOpSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.ADD_INDEXER, OperationType.REMOVE_INDEXER, OperationType.APPEND_WHITELIST, OperationType.BAN_VALIDATOR], positive: true, integer: true, min: 1, max: 4294967295, required: true },
            key: { type: 'buffer', length: ADDRESS_BYTE_LENGTH, required: true},
            bko: {
                strict: true,
                type: 'object',
                props: {
                    nonce: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true,},
                    sig: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                }
            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeBasicKeyOp(op) {
        return this.#_sanitizeBasicKeyOp(op) === true;
    }

    #compilePreTxSchema() {
        const schema = {
            $$strict: true,
            op: { type: 'string', enum: ['pre-tx'], required: true },
            tx: { type: 'string', length: HASH_BYTE_LENGTH, required: true, hex: true }, // tx hash
            is: { type: 'string', length: SIGNATURE_BYTE_LENGTH, required: true, hex: true }, // signature
            wp: { type: 'string', length: ADDRESS_BYTE_LENGTH, required: true, hex: true }, // validator public key
            i: { type: 'string', length: WRITER_BYTE_LENGTH, required: true, hex: true }, // incoming peer writer key
            ipk: { type: 'string', length: ADDRESS_BYTE_LENGTH, required: true, hex: true }, // incoming peer public key
            ch: { type: 'string', length: HASH_BYTE_LENGTH, required: true, hex: true }, // content hash
            in: { type: 'string', length: NONCE_BYTE_LENGTH, required: true, hex: true }, // nonce
            bs: { type: 'string', length: WRITER_BYTE_LENGTH, required: true, hex: true }, // peer contract bootstrap
            mbs: { type: 'string', length: WRITER_BYTE_LENGTH, required: true, hex: true }, // msb bootstrap
        };
        return this.#_validator.compile(schema);
    }
    sanitizePreTx(op) {
        return this.#_sanitizePreTx(op) === true;
    }

    #compilePostTxSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', enum: [OperationType.POST_TX], positive: true, integer: true, min: 1, max: 4294967295, required: true},
            key: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
            txo: {
                strict: true,
                type: "object",
                props: {
                    tx: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    is: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // signature
                    w: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // msb writer key
                    i: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // incoming peer writer key
                    ipk: { type: 'buffer', length: ADDRESS_BYTE_LENGTH, required: true}, // incoming peer public key
                    ch: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // content hash
                    in: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // nonce
                    bs: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // peer contract bootstrap
                    mbs: { type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // msb bootstrap
                    ws: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // validator/writer signature
                    wp: { type: 'buffer', length: ADDRESS_BYTE_LENGTH, required: true}, // validator/writer public key
                    wn: { type: 'buffer', length: NONCE_BYTE_LENGTH, required: true} // validator/writer nonce
                }
            }
        };
        return this.#_validator.compile(schema);
    }

    sanitizePostTx(op) {
        return this.#_sanitizePostTx(op) === true;
    }
}
export default Check;
