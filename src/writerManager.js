import ReadyResource from 'ready-resource';
import { createHash } from 'crypto';
import fs from 'fs';
//TODO: GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.

const FILEPATH = './whitelist/pubkeys.csv';

export class WriterManager extends ReadyResource {
    constructor(msbInstance) {
        super();
        this.msbInstance = msbInstance;
    }

    async addAdmin() {
        // case where admin entry doesn't exist yet and we have to autorize Admin public key only with bootstrap writing key
        const adminEntry = await this.msbInstance.getSigned('admin');
        if (!adminEntry && this.msbInstance.writingKey && this.msbInstance.writingKey === this.msbInstance.bootstrap) {

            
            const nonce = Math.random() + '-' + Date.now();
            const msg = Buffer.concat(
                [
                    Buffer.from(this.msbInstance.wallet.publicKey, 'hex'),
                    Buffer.from(nonce),
                ]
            )

            const hash = createHash('sha256').update(msg).digest('hex');
            await this.msbInstance.base.append({
                type: 'addAdmin',
                key: 'admin',
                value: {
                    tpk: this.msbInstance.wallet.publicKey,
                    nonce: nonce,
                    pop: this.msbInstance.wallet.sign(hash)
                }
            });
        }
        // case where admin entry exists and we won't anymore use bootstrap writig key. It can be implemented when list of authorized writers is implemented.
        // if (adminEntry && this.msbInstance.writingKey) {
        // }
    }
    async appendToWhitelist() {
        //who can use this method? only admin
        try {
            //TODO: IMPORTANT -  IF WE GONNA STORE ~ 2K-10K PUBLIC KEYS IN THE LIST, WE NEED TO SPLIT IT INTO CHUNKS
            // ONE CHUNK WILL BE ~100 PUBLIC KEYS + NONCE + SIG AND ADDITIONAL BYTES < 4096 BYTES. ADMIN WILL NEED TO PERFORM MULTIPLE APPENDS. FOR NOW THIS IS NOT IMPLEMENTED.
            const adminEntry = await this.msbInstance.getSigned('admin');
            
            if (adminEntry && this.msbInstance.wallet.publicKey === Buffer.from(adminEntry.tpk.data).toString('hex')) {
            
            const pubKeys = fs.readFileSync(FILEPATH, 'utf8').split('\n').map(line =>line.trim()).filter(line => line.length > 0); // pub keys are 32 bytes long. Take lines which have this length
            const nonce = Math.random() + '-' + Date.now();
            const msg = Buffer.concat(
                [
                    Buffer.from(pubKeys.join('')),
                    Buffer.from(nonce),
                ]
            )
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

            
        }catch(e) {
            console.log('Error reading file', e);
        }
    }
}
export default WriterManager;