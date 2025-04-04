import Validator from 'fastest-validator';
import { isHexString } from './functions.js';
class Check {
    #_validator;
    #_addRemoveAdminOrWriter;
    #_appendWhitelist;

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

        this.#_addRemoveAdminOrWriter = this.#compileAdminWriterRoleSchema();
        this.#_appendWhitelist = this.#compileAppendWhitelist();
    }

    #compileAdminWriterRoleSchema() {
        const schema = {
            type: { type: 'string', enum: ['addAdmin', 'addWriter', 'removeWriter'], required: true },
            key: { type: "is_hex_string", length: 64, required: true },
            value: {
                $$type: "object",
                wk: { type: 'is_hex_string', length: 64, required: true },
                nonce: { type: 'string', min: 1, required: true },
                sig: { type: 'is_hex_string', required: true }, // TODO: check what is eddsa signature length. Probably 64 bytes but check and test it

            }
        }
        return this.#_validator.compile(schema);
    }

    addRemoveAdminOrWriter(op) {
        return this.#_addRemoveAdminOrWriter(op) === true;
    }

    #compileIndexerSchema() {
        // addWriter and removeWriter are the same. 
        //TODO: FINISH
        const schema = {
            type: { type: 'string', enum: ['addIndexer', 'removeIndexer'], required: true },
            key: { type: "is_hex_string", length: 64, required: true },
            value: {
                $$type: "object",
                nonce: { type: 'string', min: 1, required: true },
                sig: { type: 'is_hex_string', required: true }, // TODO: check what is eddsa signature length. Probably 64 bytes but check and test it

            }
        }
        return this.#_validator.compile(schema);
    }
    //TODO ADD INTERFACE FOR ADD REMOVE INDEXER
    
    #compileAppendWhitelist() {
        const schema = {
            type: { type: 'string', enum: ['AppendWhitelist'],empty: false, required: true },
            value: {
                $$type: 'object',
                nonce: { type: 'string', min: 1, required: true },
                pubKeysList: { type: 'array', min: 1, items: { type: "is_hex_string", length: 64 }, required: true },
                sig: { type: 'string', min: 1, required: true },
            }
        };
        return this.#_validator.compile(schema);
    }

    appendWhitelist(op) {
        return this.#_appendWhitelist(op) === true;
    }
    //TX, PRE_TX, POST_TX
}

export default Check;
