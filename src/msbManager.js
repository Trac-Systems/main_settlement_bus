import ReadyResource from 'ready-resource';
import { createHash } from 'crypto';
import fs from 'node:fs';
import { isHexString } from './functions.js';
import { MAX_PUBKEYS_LENGTH, WHITELIST_FILEPATH, OperationType, EntryType } from './constants.js';
//TODO: GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.

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
        return Math.random() + '-' + Date.now(); // TODO: Change it to crypto.randomBytes. Math.random might not be secure enough. It's even better to use nonce generator from sodium.
    }

    static createMessage(...args) {
        let buf = null;
        if (args.length >= 1) {
            buf = Buffer.concat(
                args.map(arg => Buffer.from(arg, isHexString(arg) ? 'hex' : undefined))
            );
        }
        return buf;
    }

    static #assembleMessageBase(wallet, writingKey, operationType, entryType = null) {
        const nonce = this.#generateNonce();
        const msg = this.createMessage(wallet.publicKey, writingKey, nonce, operationType);
        const hash = createHash('sha256').update(msg).digest('hex');
        const baseKey = entryType ? entryType : wallet.publicKey;

        return {
            type: operationType,
            key: baseKey,
            value: {
                tracPublicKey: entryType === EntryType.ADMIN ? wallet.publicKey : undefined, // TODO: This value is redundant. Writer and validator in apply will take if from adminEntry. Take a look over the code and remove it
                wk: writingKey,
                nonce: nonce,
                sig: wallet.sign(hash)
            }
        };
    }

    static assembleAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        if ((!adminEntry && wallet && writingKey && writingKey === bootstrap) || // Admin entry doesn't exist yet, thus admin public key can only be associated with bootstrap writing key
            (adminEntry && adminEntry.tracPublicKey === wallet.publicKey && writingKey && writingKey !== adminEntry.wk)) { // Admin entry exists and we have to update its writing key in base, so it can recover admin access

            return this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_ADMIN, EntryType.ADMIN);
        }
    }

    // TODO: The other 'assemble message' methods in this class are just ignoring invalid requests. 
    //       This one, however, is throwing errors. 
    //       Decide which standard we are going to follow
    static async assembleWhitelistMessages(adminEntry, wallet) {
        try {
            if (!adminEntry) {
                throw new Error('Unauthorized: Admin entry is missing');
            }
            if (!wallet) {
                throw new Error('Unauthorized: Wallet is missing');
            }
            if (wallet.publicKey !== adminEntry.tracPublicKey) {
                throw new Error('Unauthorized: Only the admin can invoke this method');
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
            throw new Error(`Failed to create whitelist messages: ${err.message}`);
        }
    }

    // TODO: Decide if we really want to keep these methods or if we should just call the base method directly
    static assembleAddWriterMessage(wallet, writingKey) {
        return this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_WRITER);
    }

    static assembleRemoveWriterMessage(wallet, writingKey) {
        return this.#assembleMessageBase(wallet, writingKey, OperationType.REMOVE_WRITER);
    }

    static assembleAddIndexerMessage(wallet, writingKey) {
        return this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_INDEXER);
    }

    static assembleRemoveIndexerMessage(wallet, writingKey) {
        return this.#assembleMessageBase(wallet, writingKey, OperationType.REMOVE_INDEXER);
    }

    static verifyEventMessage(parsedRequest, wallet) {
        let key = null;

        if (parsedRequest.type === OperationType.ADD_WRITER || parsedRequest.type === OperationType.REMOVE_WRITER) {
            key = parsedRequest.key
        } else if (parsedRequest.type === OperationType.ADD_ADMIN) {
            key = parsedRequest.value.tracPublicKey
        }

        if (key) {
            const msg = this.createMessage(key, parsedRequest.value.wk, parsedRequest.value.nonce, parsedRequest.type);
            const hash = createHash('sha256').update(msg).digest('hex');
            return wallet.verify(parsedRequest.value.sig, hash, key);
        }

        return false
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
                throw new Error('File not found');
            }

            throw new Error(`Failed to read public keys from file: ${err.message}`);
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