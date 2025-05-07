import Validator from 'fastest-validator';
import { isHexString } from './functions.js';
import { OperationType, ADDRESS_CHAR_HEX_LENGTH, WRITER_KEY_CHAR_HEX_LENGTH, NONCE_CHAR_HEX_LENGTH, SIGNATURE_CHAR_HEX_LENGTH, HASH_CHAR_HEX_LENGTH } from './constants.js';
class Check {
    #_validator;
    #_sanitizeAdminAndWritersOperations;
    #_sanitizeIndexerOrWhitelistOperations;
    #_sanitizePreTx;
    #_sanitizePostTx;

    constructor() {
        this.#_validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                bufferedHex: "The '{field}' field must be a hex! Actual: {actual}",
                hexString: "The '{field}' field must be a valid hex string! Actual: {actual}"
            },
            customFunctions: {
                hexCheck: (value, errors) => {
                    let buf = null;
                    let result = false;
                    try {
                        buf = b4a.from(value, 'hex');
                        result = value === b4a.toString(buf, 'hex');
                    } catch (e) {
                    }
                    return result;
                },
                hexStringCheck: (value, errors) => {
                    try {
                        return isHexString(value);
                    } catch (e) {
                    }
                    return false;
                }
            }
        });

        this.#_validator.add("is_hex", function ({ schema, messages }, path, context) {
            return {
                source: `
                    const result = context.customFunctions.hexCheck(value, errors);
                    if(false === result) ${this.makeError({ type: "bufferedHex", actual: "value", messages })}
                    return value;
                `
            };
        });

        this.#_validator.add("is_hex_string", function ({ schema, messages }, path, context) {
            return {
                source: `
                    const result = context.customFunctions.hexStringCheck(value, errors);
                    if(false === result) ${this.makeError({ type: "hexString", actual: "value", messages })}
                    return value;
                `
            };
        });

        this.#_sanitizeAdminAndWritersOperations = this.#compileSanitizationAdminAndWriterOperationsSchema();
        this.#_sanitizeIndexerOrWhitelistOperations = this.#compileIndexerOrWhitelistOperationSchema();
        this.#_sanitizePreTx = this.#compilePreTxSchema();
        this.#_sanitizePostTx = this.#compilePostTxSchema();
    }
    //TODO: rename this function
    #compileSanitizationAdminAndWriterOperationsSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'string', enum: [OperationType.ADD_ADMIN, OperationType.ADD_WRITER, OperationType.REMOVE_WRITER], required: true },
            key: { type: "is_hex_string", length: ADDRESS_CHAR_HEX_LENGTH, required: true },
            value: {
                $$strict: true,
                $$type: "object",
                pub: { type: 'is_hex_string', length: ADDRESS_CHAR_HEX_LENGTH, required: true },
                wk: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true },
                nonce: { type: 'is_hex_string', length: NONCE_CHAR_HEX_LENGTH, required: true },
                sig: { type: 'is_hex_string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true },

            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeAdminAndWritersOperations(op) {
        return this.#_sanitizeAdminAndWritersOperations(op) === true;
    }
    //TODO: rename this function
    #compileIndexerOrWhitelistOperationSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'string', enum: [OperationType.ADD_INDEXER, OperationType.REMOVE_INDEXER, OperationType.APPEND_WHITELIST, OperationType.BAN_VALIDATOR], required: true },
            key: { type: "is_hex_string", length: ADDRESS_CHAR_HEX_LENGTH, required: true },
            value: {
                $$strict: true,
                $$type: "object",
                nonce: { type: 'is_hex_string', length: NONCE_CHAR_HEX_LENGTH, required: true },
                sig: { type: 'is_hex_string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true },

            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeIndexerOrWhitelistOperations(op) {
        return this.#_sanitizeIndexerOrWhitelistOperations(op) === true;
    }

    #compilePreTxSchema() {
        const schema = {
            $$strict: true,
            op: { type: 'string', enum: ['pre-tx'], required: true },
            tx: { type: 'is_hex_string', length: HASH_CHAR_HEX_LENGTH, required: true },  // tx hash
            is: { type: 'is_hex_string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true }, // signature
            wp: { type: 'is_hex_string', length: ADDRESS_CHAR_HEX_LENGTH, required: true }, // validator public key
            i: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // incoming peer writer key
            ipk: { type: 'is_hex_string', length: ADDRESS_CHAR_HEX_LENGTH, required: true }, // incoming peer public key
            ch: { type: 'is_hex_string', length: HASH_CHAR_HEX_LENGTH, required: true }, // content hash
            in: { type: 'is_hex_string', length: NONCE_CHAR_HEX_LENGTH, required: true }, // nonce 
            bs: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // peer contract bootestrap
            mbs: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // msb bootstrap
        };
        return this.#_validator.compile(schema);
    }

    sanitizePreTx(op) {
        return this.#_sanitizePreTx(op) === true;
    }

    #compilePostTxSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'string', enum: ['tx'], required: true },
            key: { type: 'is_hex_string', length: HASH_CHAR_HEX_LENGTH, required: true }, // tx hash
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: 'string', enum: ['post-tx'], required: true },
                tx: { type: 'is_hex_string', length: HASH_CHAR_HEX_LENGTH, required: true }, // tx hash
                is: { type: 'is_hex_string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true }, // signature
                w: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // msb writer key
                i: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // incoming peer writer key
                ipk: { type: 'is_hex_string', length: ADDRESS_CHAR_HEX_LENGTH, required: true }, // incoming peer public key
                ch: { type: 'is_hex_string', length: HASH_CHAR_HEX_LENGTH, required: true }, // content hash
                in: { type: 'is_hex_string', length: NONCE_CHAR_HEX_LENGTH, required: true }, //nonce 
                bs: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // peer contract bootestrap
                mbs: { type: 'is_hex_string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true }, // msb bootstrap
                ws: { type: 'is_hex_string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true }, // validator/writer signature
                wp: { type: 'is_hex_string', length: ADDRESS_CHAR_HEX_LENGTH, required: true }, // validator/writer public key
                wn: { type: 'is_hex_string', length: NONCE_CHAR_HEX_LENGTH, required: true }, // validator/writer nonce
            }
        };
        return this.#_validator.compile(schema);
    }

    sanitizePostTx(op) {
        return this.#_sanitizePostTx(op) === true;
    }
}

export default Check;
