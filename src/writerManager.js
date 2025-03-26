import ReadyResource from 'ready-resource';
import { createHash } from 'crypto';
import fs from 'node:fs';
import {isHexString} from './functions.js';
//TODO: GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.

const FILEPATH = './whitelist/pubkeys.csv';

export class WriterManager extends ReadyResource {
    constructor(msbInstance) {
        super();
        this.msbInstance = msbInstance;
    }

    #generateNonce() {
        return Math.random() + '-' + Date.now(); // TODO: Maybe change it to crypto.randomBytes. Math.random might not be secure enough
    }

    #createMessage(...args) {
        let buf = null;
        if (args.length >= 1) {
            buf = Buffer.concat(
                args.map(arg => Buffer.from(arg, isHexString(arg) ? 'hex' : undefined))
            );
        }
        return buf;
    }

    async addAdmin() {
        // case where admin entry doesn't exist yet and we have to autorize Admin public key only with bootstrap writing key
        const adminEntry = await this.msbInstance.getSigned('admin');
        if (!adminEntry && this.msbInstance.writingKey && this.msbInstance.writingKey === this.msbInstance.bootstrap) {
            const nonce = this.#generateNonce();
            const msg = this.#createMessage(this.msbInstance.wallet.publicKey, nonce);
            const hash = createHash('sha256').update(msg).digest('hex');
            await this.msbInstance.base.append({
                type: 'addAdmin',
                key: 'admin',
                value: {
                    tracPublicKey: this.msbInstance.wallet.publicKey,
                    nonce: nonce,
                    pop: this.msbInstance.wallet.sign(hash)
                }
            });
        }
        // case where admin entry exists and we won't anymore use bootstrap writing key. It can be implemented when list of authorized writers is implemented.
        // if (adminEntry && this.msbInstance.writingKey) {
        // }
    }

    async appendToWhitelist() {
        // This method can only be invoked by admin
        try {
            //TODO: IMPORTANT -  IF WE GONNA STORE ~ 2K-10K PUBLIC KEYS IN THE LIST, WE NEED TO SPLIT IT INTO CHUNKS
            // ONE CHUNK WILL BE ~100 PUBLIC KEYS + NONCE + SIG AND ADDITIONAL BYTES < 4096 BYTES. ADMIN WILL NEED TO PERFORM MULTIPLE APPENDS. FOR NOW THIS IS NOT IMPLEMENTED.
            const adminEntry = await this.msbInstance.getSigned('admin');

            if (adminEntry && this.msbInstance.wallet.publicKey === Buffer.from(adminEntry.tracPublicKey.data).toString('hex')) {
                const pubKeys = fs.readFileSync(FILEPATH, 'utf8')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                    
                const nonce = this.#generateNonce();
                const msg = this.#createMessage(pubKeys.join(''), nonce);
                const hash = createHash('sha256').update(msg).digest('hex');
                await this.msbInstance.base.append({
                    type: 'whitelist',
                    key: 'list',
                    value: {
                        nonce: nonce,
                        pubKeysList: JSON.stringify(pubKeys),
                        sig: this.msbInstance.wallet.sign(hash)
                    }
                });
            }
        } catch (e) {
            // TODO: Implement proper error handling
            console.log('Error reading file', e);
        }
    }
}
export default WriterManager;