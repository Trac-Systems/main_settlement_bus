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
            key: { type: "string", length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true },
            value: {
                strict: true,
                type: "object",
                props: {
                    pub: { type: 'string', length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true },
                    wk: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true },
                    nonce: { type: 'string', length: NONCE_CHAR_HEX_LENGTH, required: true, hex: true },
                    sig: { type: 'string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true, hex: true },
                }
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
            key: { type: "string", length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true },
            value: {
                strict: true,
                type: "object",
                props: {
                    nonce: { type: 'string', length: NONCE_CHAR_HEX_LENGTH, required: true, hex: true },
                    sig: { type: 'string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true, hex: true },
                }

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
            tx: { type: 'string', length: HASH_CHAR_HEX_LENGTH, required: true, hex: true }, // tx hash
            is: { type: 'string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true, hex: true }, // signature
            wp: { type: 'string', length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true }, // validator public key
            i: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // incoming peer writer key
            ipk: { type: 'string', length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true }, // incoming peer public key
            ch: { type: 'string', length: HASH_CHAR_HEX_LENGTH, required: true, hex: true }, // content hash
            in: { type: 'string', length: NONCE_CHAR_HEX_LENGTH, required: true, hex: true }, // nonce
            bs: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // peer contract bootstrap
            mbs: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // msb bootstrap
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
            key: { type: 'string', length: HASH_CHAR_HEX_LENGTH, required: true, hex: true }, // tx hash
            value: {
                strict: true,
                type: "object",
                props: {
                    op: { type: 'string', enum: ['post-tx'], required: true }, // operation type
                    tx: { type: 'string', length: HASH_CHAR_HEX_LENGTH, required: true, hex: true }, // tx hash
                    is: { type: 'string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true, hex: true }, // signature
                    w: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // msb writer key
                    i: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // incoming peer writer key
                    ipk: { type: 'string', length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true }, // incoming peer public key
                    ch: { type: 'string', length: HASH_CHAR_HEX_LENGTH, required: true, hex: true }, // content hash
                    in: { type: 'string', length: NONCE_CHAR_HEX_LENGTH, required: true, hex: true }, // nonce
                    bs: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // peer contract bootstrap
                    mbs: { type: 'string', length: WRITER_KEY_CHAR_HEX_LENGTH, required: true, hex: true }, // msb bootstrap
                    ws: { type: 'string', length: SIGNATURE_CHAR_HEX_LENGTH, required: true, hex: true }, // validator/writer signature
                    wp: { type: 'string', length: ADDRESS_CHAR_HEX_LENGTH, required: true, hex: true }, // validator/writer public key
                    wn: { type: 'string', length: NONCE_CHAR_HEX_LENGTH, required: true, hex: true } // validator/writer nonce
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