import ReadyResource from 'ready-resource';
import { createHash } from 'crypto';
import fs from 'node:fs';
import { isHexString } from './functions.js';
//TODO: GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.

const FILEPATH = './whitelist/pubkeys.csv';

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

    static assembleAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        // case where admin entry doesn't exist yet and we have to autorize Admin public key only with bootstrap writing key
        if (!adminEntry && wallet && writingKey && writingKey === bootstrap) {
            const nonce = this.#generateNonce();
            const msg = this.createMessage(wallet.publicKey, nonce, 'addAdmin');
            const hash = createHash('sha256').update(msg).digest('hex');
            return {
                type: 'addAdmin',
                key: 'admin',
                value: {
                    tracPublicKey: wallet.publicKey,
                    nonce: nonce,
                    pop: wallet.sign(hash)
                }
            };
        }
        // case where admin entry exists and we won't anymore use bootstrap writing key. It can be implemented when list of authorized writers is implemented.
        // if (adminEntry && this.msbInstance.writingKey) {
        // }
    }

    static assembleWhiteListMessage(adminEntry, wallet) {
        // This method can only be invoked by admin
        try {
            //TODO: IMPORTANT -  IF WE GONNA STORE ~ 2K-10K PUBLIC KEYS IN THE LIST, WE NEED TO SPLIT IT INTO CHUNKS
            // ONE CHUNK WILL BE ~100 PUBLIC KEYS + NONCE + SIG AND ADDITIONAL BYTES < 4096 BYTES. ADMIN WILL NEED TO PERFORM MULTIPLE APPENDS. FOR NOW THIS IS NOT IMPLEMENTED.
            if (adminEntry && wallet && wallet.publicKey === adminEntry.tracPublicKey) {
                const pubKeys = fs.readFileSync(FILEPATH, 'utf8')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                const nonce = this.#generateNonce();
                const msg = this.createMessage(pubKeys.join(''), nonce, 'whitelist');
                const hash = createHash('sha256').update(msg).digest('hex');
                return {
                    type: 'whitelist',
                    key: 'list',
                    value: {
                        nonce: nonce,
                        pubKeysList: JSON.stringify(pubKeys),
                        sig: wallet.sign(hash)
                    }
                };
            }
        } catch (e) {
            // TODO: Implement proper error handling
            console.log('Error reading file', e);
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

    static verifyAddWriterMessage(parsedRequest, wallet) {
        const nonce = parsedRequest.value.nonce;
        const msg = this.createMessage(parsedRequest.key, parsedRequest.value.wk, nonce, parsedRequest.type);
        const hash = createHash('sha256').update(msg).digest('hex');
        return wallet.verify(parsedRequest.value.sig, hash, parsedRequest.key);
    }

}

export default MsbManager;