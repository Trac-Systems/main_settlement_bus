import Validator from 'fastest-validator';
import { isHexString } from './functions.js';
import {OperationType} from './constants.js';
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
        // TODO: Create constants for int values below
        const schema = {
            $$strict: true,
            type: { type: 'string', enum: [OperationType.ADD_ADMIN, OperationType.ADD_WRITER, OperationType.REMOVE_WRITER], required: true },
            key: { type: "is_hex_string", length: 64, required: true },
            value: {
                $$strict: true,
                $$type: "object",
                pub: { type: 'is_hex_string', length: 64, required: true },
                wk: { type: 'is_hex_string', length: 64, required: true },
                nonce: { type: 'is_hex_string', length: 64, required: true },
                sig: { type: 'is_hex_string', length: 128, required: true },

            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeAdminAndWritersOperations(op) {
        return this.#_sanitizeAdminAndWritersOperations(op) === true;
    }
    //TODO: rename this function
    #compileIndexerOrWhitelistOperationSchema() {
        // TODO: Create constants for int values below
        const schema = {
            $$strict: true,
            type: { type: 'string', enum: [OperationType.ADD_INDEXER, OperationType.REMOVE_INDEXER, OperationType.APPEND_WHITELIST, OperationType.BAN_VALIDATOR], required: true },
            key: { type: "is_hex_string", length: 64, required: true },
            value: {
                $$strict: true,
                $$type: "object",
                nonce: { type: 'is_hex_string', length: 64, required: true },
                sig: { type: 'is_hex_string', length: 128, required: true },

            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeIndexerOrWhitelistOperations(op) {
        return this.#_sanitizeIndexerOrWhitelistOperations(op) === true;
    }

    #compilePreTxSchema() {
        // TODO: Create constants for int values below
        const schema = {
            $$strict: true,
            op: { type: 'string', enum: ['pre-tx'], required: true },
            tx: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
            is: { type: 'is_hex_string', length: 128, required: true },
            wp: { type: 'is_hex_string', length: 64, required: true },
            i: { type: 'is_hex_string', length: 64, required: true },
            ipk: { type: 'is_hex_string', length: 64, required: true },
            ch: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
            in: { type: 'is_hex_string', length: 64,  required: true },
            bs: { type: 'is_hex_string', length: 64, required: true },
            mbs: { type: 'is_hex_string', length: 64, required: true },
        };
        return this.#_validator.compile(schema);
    }

    sanitizePreTx(op) {
        return this.#_sanitizePreTx(op) === true;
    }

    #compilePostTxSchema() {
        // TODO: Create constants for int values below
        const schema = {
            $$strict: true,
            type: { type: 'string', enum: ['tx'], required: true },
            key: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: 'string', enum: ['post-tx'], required: true },
                tx: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
                is: { type: 'is_hex_string', length: 128, required: true },
                w: { type: 'is_hex_string', length: 64, required: true },
                i: { type: 'is_hex_string', length: 64, required: true },
                ipk: { type: 'is_hex_string', length: 64, required: true },
                ch: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
                in: { type: 'is_hex_string', length: 64, required: true },
                bs: { type: 'is_hex_string', length: 64, required: true },
                mbs: { type: 'is_hex_string', length: 64, required: true },
                ws: { type: 'is_hex_string', length: 128, required: true },
                wp: { type: 'is_hex_string', length: 64, required: true },
                wn: { type: 'is_hex_string', length: 64, required: true }
            }
        };
        return this.#_validator.compile(schema);
    }

    sanitizePostTx(op) {
        return this.#_sanitizePostTx(op) === true;
    }
}

export default Check;
