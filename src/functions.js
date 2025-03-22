import { createHash } from "node:crypto";
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

export function restoreManifest(parsedManifest) {

    if (Array.isArray(parsedManifest.signers)) {
        parsedManifest.signers = parsedManifest.signers.map(signer => {
            if(signer.namespace && signer.namespace.data &&signer.publicKey && signer.publicKey.data){ 
                return {
                    ...signer,
                    namespace: Buffer.from(signer.namespace.data),
                    publicKey: Buffer.from(signer.publicKey.data),
                }
            } else {
                return signer;
            }
        });
    }

    return parsedManifest;
}

// To improve - could be done in better approach (simplify)
export function restoreHash(parsedPreTx) {
    const reconstructedContentHash = createHash('sha256')
        .update(JSON.stringify(parsedPreTx.ch))
        .digest('hex');

    const reconstructedTxHash = createHash('sha256')
        .update(
            parsedPreTx.w + '-' +
            parsedPreTx.i + '-' +
            parsedPreTx.ipk + '-' +
            reconstructedContentHash + '-' +
            parsedPreTx.in
        )
        .digest('hex');

    const finalReconstructedTxHash = createHash('sha256')
        .update(reconstructedTxHash)
        .digest('hex');
    return finalReconstructedTxHash;
}

export async function verifyDag(autoBaseInsance) {
    try {
        console.log('--- DAG Monitoring ---');
        const dagView = await autoBaseInsance.view.core.treeHash();
        const lengthdagView = autoBaseInsance.view.core.length;
        const dagSystem = await autoBaseInsance.system.core.treeHash();
        const lengthdagSystem = autoBaseInsance.system.core.length;
        console.log('this.base.view.core.signedLength:', autoBaseInsance.view.core.signedLength);
        console.log("this.base.signedLength", autoBaseInsance.signedLength);
        console.log("this.base.linearizer.indexers.length", autoBaseInsance.linearizer.indexers.length);
        console.log("this.base.indexedLength", autoBaseInsance.indexedLength);
        console.log(`base.key/writingKey: ${autoBaseInsance.key.toString('hex')}`);

        console.log(`VIEW Dag: ${dagView.toString('hex')} (length: ${lengthdagView})`);
        console.log(`SYSTEM Dag: ${dagSystem.toString('hex')} (length: ${lengthdagSystem})`);

    } catch (error) {
        console.error('Error during DAG monitoring:', error.message);
    }
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}