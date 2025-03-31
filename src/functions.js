import b4a from 'b4a';
//TODO: if something is missing, add additonal sanitization
// parsed.op === 'pre-tx' -> moved out of the scope this check because we can re-use this function in the apply
// TODO: Split sanitization on pre and post TX
export function sanitizeTransaction(parsedTx) {
    return (
        typeof parsedTx === 'object' &&
        parsedTx !== null &&
        typeof parsedTx.op === 'string' &&
        typeof parsedTx.tx === 'string' &&
        typeof parsedTx.w === 'string' &&
        typeof parsedTx.i === 'string' &&
        typeof parsedTx.ipk === 'string' &&
        typeof parsedTx.is === 'string'
    );
}


export function isHexString(string) {
    return typeof string === 'string' && /^[0-9a-fA-F]+$/.test(string) && string.length % 2 === 0;
}

export async function verifyDag(base) {
        try {
            console.log('--- DAG Monitoring ---');
            const dagView = await base.view.core.treeHash();
            const lengthdagView = base.view.core.length;
            const dagSystem = await base.system.core.treeHash();
            const lengthdagSystem = base.system.core.length;
            console.log('this.base.view.core.signedLength:', base.view.core.signedLength);
            console.log("this.base.signedLength", base.signedLength);
            console.log("this.base.linearizer.indexers.length", base.linearizer.indexers.length);
            console.log("this.base.indexedLength", base.indexedLength);
            //console.log("this.base.system.core", this.base.system.core);
            console.log(`base.key: ${base.key.toString('hex')}`);
            console.log('discoveryKey:', b4a.toString(base.discoveryKey, 'hex'));

            console.log(`VIEW Dag: ${dagView.toString('hex')} (length: ${lengthdagView})`);
            console.log(`SYSTEM Dag: ${dagSystem.toString('hex')} (length: ${lengthdagSystem})`);

        } catch (error) {
            console.error('Error during DAG monitoring:', error.message);
        }
    }

    export async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    export async function createHash(type, message){
        if(type === 'sha256'){
            const out = b4a.alloc(sodium.crypto_hash_sha256_BYTES);
            sodium.crypto_hash_sha256(out, b4a.from(message));
            return b4a.toString(out, 'hex');
        }
        let createHash = null;
        if(global.Pear !== undefined){
            let _type = '';
            switch(type.toLowerCase()){
                case 'sha1': _type = 'SHA-1'; break;
                case 'sha384': _type = 'SHA-384'; break;
                case 'sha512': _type = 'SHA-512'; break;
                default: throw new Error('Unsupported algorithm.');
            }
            const encoder = new TextEncoder();
            const data = encoder.encode(message);
            const hash = await crypto.subtle.digest(_type, data);
            const hashArray = Array.from(new Uint8Array(hash));
            return hashArray
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        } else {
            return crypto.createHash(type).update(message).digest('hex')
        }
    }   