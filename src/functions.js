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