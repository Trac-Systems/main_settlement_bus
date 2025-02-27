import crypto from 'hypercore-crypto';

//TODO: if something is missing, add additonal sanitization
// todo : check also this  parsed.op === 'pre-tx' 
export function sanitizePreTransaction(parsedTx) {
    return (
        typeof parsedTx === 'object' && parsedTx !== null &&
        typeof parsedTx.op === 'string' &&
        typeof parsedTx.tx === 'string' &&
        typeof parsedTx.w === 'string' &&
        typeof parsedTx.i === 'string' &&
        typeof parsedTx.ipk === 'object' && parsedTx.ipk !== null && Array.isArray(parsedTx.ipk.data) &&
        parsedTx.ipk.type === 'Buffer' &&
        typeof parsedTx.isig === 'object' && parsedTx.isig !== null && Array.isArray(parsedTx.isig.data) &&
        parsedTx.isig.type === 'Buffer' &&
        parsedTx.ipk.data.every(num => typeof num === 'number' && num >= 0 && num <= 255) &&
        parsedTx.isig.data.every(num => typeof num === 'number' && num >= 0 && num <= 255)
    );
}