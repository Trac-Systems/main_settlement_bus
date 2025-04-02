import ReadyResource from 'ready-resource';
import { createHash } from 'crypto';
import fs from 'node:fs';
import { isHexString } from './functions.js';
import { MAX_PUBKEYS_LENGTH, WHITELIST_FILEPATH, OperationType, EntryType } from './constants.js';
import b4a from 'b4a';
// TODO: This class is trying to solve too many problems at once.
//       It is responsible for creating messages, verifying them, reading public keys from a file, etc.
//       It would be better to separate these concerns into different classes or modules.
//       For example, we could have a separate class for file operations, another for message creation, etc.
//       This would make the code more modular and easier to maintain.
//       It would also make it easier to create tests and mocks in the future.
export class MsbManager extends ReadyResource {
    constructor(msbInstance) {
        super();
        this.msbInstance = msbInstance;

    }

    static #generateNonce() {
        return Math.random() + '-' + Date.now(); // TODO: Change it to crypto.randomBytes. Math.random might not be secure enough. It's even better to use nonce generator from sodium. GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.
    }

    static createMessage(...args) {
        let buf = null;
        if (args.length >= 1) {
            buf = b4a.concat(
                args.map(arg => b4a.from(arg, isHexString(arg) ? 'hex' : undefined))
            );
        }
        return buf;
    }

    static #assembleMessageBase(wallet, keyParam, operationType) {
        let nonce = null;
        let msg = null;
        let hash = null;
        let baseKey = wallet.publicKey;
        let value = null;
    
        switch (operationType) {
            case OperationType.ADD_ADMIN:
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
                nonce = this.#generateNonce();
                msg = this.createMessage(wallet.publicKey, keyParam, nonce, operationType);
                hash = createHash('sha256').update(msg).digest('hex');
                value = {
                    wk: keyParam,
                    nonce: nonce,
                    sig: wallet.sign(hash)
                };
                break;
    
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
                nonce = this.#generateNonce();
                msg = this.createMessage(keyParam, nonce, operationType);
                hash = createHash('sha256').update(msg).digest('hex');
                baseKey = keyParam;
                value = {
                    nonce: nonce,
                    sig: wallet.sign(hash)
                };
                break;
    
            default:
                return undefined;
        }
    
        return {
            type: operationType,
            key: baseKey,
            value
        };
    }

    static assembleAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        if ((!adminEntry && wallet && writingKey && writingKey === bootstrap) || // Admin entry doesn't exist yet, thus admin public key can only be associated with bootstrap writing key
            (adminEntry && adminEntry.tracPublicKey === wallet.publicKey && writingKey && writingKey !== adminEntry.wk)) { // Admin entry exists and we have to update its writing key in base, so it can recover admin access

            return this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_ADMIN);
        }
    }


    static async assembleWhitelistMessages(adminEntry, wallet) {
        try {
            if (!adminEntry || !wallet || wallet.publicKey !== adminEntry.tracPublicKey) {
                return null;
            }
            
            const messages = [];
            const pubKeys = await this.readPublicKeysFromFile();
            const chunks = this.chunkPublicKeys(pubKeys, MAX_PUBKEYS_LENGTH);

            for (const chunk of chunks) {
                const nonce = this.#generateNonce();
                const msg = this.createMessage(chunk.join(''), nonce, OperationType.APPEND_WHITELIST);
                const hash = createHash('sha256').update(msg).digest('hex');

                messages.push({
                    nonce: nonce,
                    pubKeysList: JSON.stringify(chunk),
                    sig: wallet.sign(hash)
                });

            }

            return messages;
        } catch (err) {
            console.log(`Failed to create whitelist messages: ${err.message}`);
        }
    }

    static assembleAddWriterMessage(wallet, writingKey) {
        return this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_WRITER);
    }

    static assembleRemoveWriterMessage(wallet, writingKey) {
        return this.#assembleMessageBase(wallet, writingKey, OperationType.REMOVE_WRITER);
    }

    static assembleAddIndexerMessage(wallet, writerTracPublicKey) {
        return this.#assembleMessageBase(wallet, writerTracPublicKey, OperationType.ADD_INDEXER);
    }

    static assembleRemoveIndexerMessage(wallet, writerTracPublicKey) {
        return this.#assembleMessageBase(wallet, writerTracPublicKey, OperationType.REMOVE_INDEXER);
    }

    static verifyEventMessage(parsedRequest, wallet) {
        //TODO: Here we can add some sanitization
        console.log('parsedRequest:', parsedRequest);
        const msg = this.createMessage(parsedRequest.key, parsedRequest.value.wk, parsedRequest.value.nonce, parsedRequest.type);
        const hash = createHash('sha256').update(msg).digest('hex');
        return wallet.verify(parsedRequest.value.sig, hash, parsedRequest.key);
    }

    static async readPublicKeysFromFile() {
        try {
            const data = await fs.promises.readFile(WHITELIST_FILEPATH, 'utf8');
            const pubKeys = data
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            if (pubKeys.length === 0) {
                throw new Error('The file does not contain any public keys');
            }

            return pubKeys;
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('Whitelist file not found');
            }
            console.log(`Failed to read public keys from the whitelist file: ${err.message}`);
        }
    }

    static chunkPublicKeys(pubKeys, chunkSize) {
        const chunks = [];
        for (let i = 0; i < pubKeys.length; i += chunkSize) {
            chunks.push(pubKeys.slice(i, i + chunkSize));
        }
        return chunks;
    }

}

export default MsbManager;