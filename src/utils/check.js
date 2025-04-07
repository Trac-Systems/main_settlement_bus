import Validator from 'fastest-validator';
import { isHexString } from './functions.js';
class Check {
    #_validator;
    #_sanitizeAdminAndWritersOperations;
    #_appendWhitelist;
    #_sanitizeIndexerOperations;
    #_preTx;
    #_postTx;

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
        this.#_appendWhitelist = this.#compileAppendWhitelistSchema();
        this.#_sanitizeIndexerOperations = this.#compileIndexerSchema();
        this.#_preTx = this.#compilePreTxSchema();
        this.#_postTx = this.#compilePostTxSchema();
    }

    #compileSanitizationAdminAndWriterOperationsSchema() {
        const schema = {
            type: { type: 'string', enum: ['addAdmin', 'addWriter', 'removeWriter'], required: true },
            key: { type: "is_hex_string", length: 64, required: true },
            value: {
                $$type: "object",
                wk: { type: 'is_hex_string', length: 64, required: true },
                nonce: { type: 'string', min: 1, required: true }, // TODO: this nonce is temporary as string
                sig: { type: 'is_hex_string', required: true }, // TODO: check what is eddsa signature length. Probably 64 which mean length: 128 but check and test it

            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeAdminAndWritersOperations(op) {
        return this.#_sanitizeAdminAndWritersOperations(op) === true;
    }

    #compileIndexerSchema() {
        const schema = {
            type: { type: 'string', enum: ['addIndexer', 'removeIndexer'], required: true },
            key: { type: "is_hex_string", length: 64, required: true },
            value: {
                $$type: "object",
                nonce: { type: 'string', min: 1, required: true }, // TODO: this nonce is temporary as string
                sig: { type: 'is_hex_string', required: true }, // TODO: check what is eddsa signature length. Probably 64 which mean length: 128 but check and test it

            }
        }
        return this.#_validator.compile(schema);
    }

    sanitizeIndexerOperations(op) {
        return this.#_sanitizeIndexerOperations(op) === true;
    }

    #compileAppendWhitelistSchema() {
        const schema = {
            type: { type: 'string', enum: ['AppendWhitelist'], empty: false, required: true },
            value: {
                $$type: 'object',
                nonce: { type: 'string', min: 1, required: true }, // TODO: this nonce is temporary as string
                pubKeysList: { type: 'array', min: 1, items: { type: "is_hex_string", length: 64 }, required: true },
                sig: { type: 'is_hex_string', required: true }, // TODO: check what is eddsa signature length. Probably 64 which mean length: 128 but check and test it
            }
        };
        return this.#_validator.compile(schema);
    }

    appendWhitelist(op) {
        return this.#_appendWhitelist(op) === true;
    }
    
    #compilePreTxSchema() {
        const schema = {
            op: { type: 'string', enum: ['pre-tx'], required: true },
            tx: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
            is: { type: 'is_hex_string', required: true },  // TODO: check what is eddsa signature length. Probably 64 which mean length: 128 but check and test it
            w: { type: 'is_hex_string', length: 64, required: true },
            i: { type: 'is_hex_string', length: 64, required: true },
            ipk: { type: 'is_hex_string', length: 64, required: true },
            ch: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
            in: { type: 'string', min: 1, required: true }, // TODO: this nonce is temporary as string
            bs: { type: 'is_hex_string', length: 64, required: true },
            mbs: { type: 'is_hex_string', length: 64, required: true },
        };
        return this.#_validator.compile(schema);
    }

    preTx(op) {
        return this.#_preTx(op) === true;
    }

    #compilePostTxSchema() {
        const schema = {
            type: { type: 'string', enum: ['tx'], required: true },
            key: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
            value: {
                $$type: "object",
                op: { type: 'string', enum: ['post-tx'], required: true },
                tx: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
                is: { type: 'is_hex_string', required: true },  // TODO: check what is eddsa signature length. Probably 64 which mean length: 128 but check and test it
                w: { type: 'is_hex_string', length: 64, required: true },
                i: { type: 'is_hex_string', length: 64, required: true },
                ipk: { type: 'is_hex_string', length: 64, required: true },
                ch: { type: 'is_hex_string', required: true }, // TODO: if we will use only 256 bit hash then change to length: 64
                in: { type: 'string', min: 1, required: true }, // TODO: this nonce is temporary as string
                bs: { type: 'is_hex_string', length: 64, required: true },
                mbs: { type: 'is_hex_string', length: 64, required: true },
                ws: { type: 'is_hex_string', required: true }, // TODO: check what is eddsa signature length. Probably 64 which mean length: 128 but check and test it
                wp: { type: 'is_hex_string', length: 64, required: true },
                wn: { type: 'string', min: 1, required: true }
            }
        };
        return this.#_validator.compile(schema);
    }

    postTx(op) {
        return this.#_postTx(op) === true;
    }
}

export default Check;
