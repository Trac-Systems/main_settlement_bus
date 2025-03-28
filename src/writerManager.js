import ReadyResource from 'ready-resource';
import { createHash } from 'crypto';
import fs from 'node:fs';
import { isHexString } from './functions.js';
//TODO: GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.

const FILEPATH = './whitelist/pubkeys.csv';
const CHUNK_SIZE = 100;
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

    static async readPublicKeysFromFile() {
        try {
            const data = await fs.promises.readFile(FILEPATH, 'utf8');
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

    static assembleAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        // case where admin entry doesn't exist yet and we have to autorize Admin public key only with bootstrap writing key
        if (!adminEntry && wallet && writingKey && writingKey === bootstrap) {
            const nonce = this.#generateNonce();
            const msg = this.createMessage(wallet.publicKey, writingKey ,nonce, 'addAdmin');
            const hash = createHash('sha256').update(msg).digest('hex');
            return {
                type: 'addAdmin',
                key: 'admin',
                value: {
                    tracPublicKey: wallet.publicKey,
                    wk: writingKey,
                    nonce: nonce,
                    sig: wallet.sign(hash)
                }
            };
        } else if (adminEntry && adminEntry.tracPublicKey === wallet.publicKey && writingKey && writingKey !== adminEntry.wk) {
            // case where admin entry exists and we have to authorize Admin public key only with bootstrap writing key
            const nonce = this.#generateNonce();
            const msg = this.createMessage(wallet.publicKey, writingKey, nonce, 'addAdmin');
            const hash = createHash('sha256').update(msg).digest('hex');
            return {
                type: 'addAdmin',
                key: 'admin',
                value: {
                    tracPublicKey: wallet.publicKey, // TODO: This value is redundant. Writer and validator in apply will take if from adminEntry. Take a look over the code and remove it.
                    wk: writingKey,
                    nonce: nonce,
                    sig: wallet.sign(hash)
                }
            };
        }
        // case where admin entry exists and we won't anymore use bootstrap writing key. It can be implemented when list of authorized writers is implemented.
        // if (adminEntry && this.msbInstance.writingKey) {
        // }
    }

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
            const chunks = this.chunkPublicKeys(pubKeys, CHUNK_SIZE);

            for (const chunk of chunks) {
                const nonce = this.#generateNonce();
                const msg = this.createMessage(chunk.join(''), nonce, 'whitelist');
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

    static assembleAddWriterMessage(wallet, writingKey) {
        const nonce = this.#generateNonce();
        const msg = this.createMessage(wallet.publicKey, writingKey, nonce, 'addWriter');
        const hash = createHash('sha256').update(msg).digest('hex');

        return {
            type: 'addWriter',
            key: wallet.publicKey,
            value: {
                wk: writingKey,
                nonce: nonce,
                sig: wallet.sign(hash)
            }
        };
    }

    static assembleRemoveWriterMessage(wallet, writingKey) {
        const nonce = this.#generateNonce();
        const msg = this.createMessage(wallet.publicKey, writingKey, nonce, 'removeWriter');
        const hash = createHash('sha256').update(msg).digest('hex');

        return {
            type: 'removeWriter',
            key: wallet.publicKey,
            value: {
                wk: writingKey,
                nonce: nonce,
                sig: wallet.sign(hash)
            }
        };
    }
    static verifyEventMessage(parsedRequest, wallet) {
        let msg = null;
        if (parsedRequest.type === 'addWriter' || parsedRequest.type === 'removeWriter') {
            msg = this.createMessage(parsedRequest.key, parsedRequest.value.wk, parsedRequest.value.nonce, parsedRequest.type);
            const hash = createHash('sha256').update(msg).digest('hex');
            return wallet.verify(parsedRequest.value.sig, hash, parsedRequest.key);
        } else if (parsedRequest.type === 'addAdmin') {
            msg = this.createMessage(parsedRequest.value.tracPublicKey, parsedRequest.value.wk, parsedRequest.value.nonce, parsedRequest.type);
            const hash = createHash('sha256').update(msg).digest('hex');
            return wallet.verify(parsedRequest.value.sig, hash, parsedRequest.value.tracPublicKey);
        }
        return false
    }

}

export default MsbManager;