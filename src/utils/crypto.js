import sodium from 'sodium-native';
import b4a from 'b4a';
import Wallet from 'trac-wallet';
import { OperationType } from './constants.js'
import { addressToBuffer } from '../core/state/ApplyOperationEncodings.js';

export async function createHash(type, message) {
    if (type === 'sha256') {
        const out = b4a.alloc(sodium.crypto_hash_sha256_BYTES);
        sodium.crypto_hash_sha256(out, !b4a.isBuffer(message) ? b4a.from(message) : message);
        return out;
    }
    if (global.Pear !== undefined) {
        let _type = '';
        switch (type.toLowerCase()) {
            case 'sha1': _type = 'SHA-1'; break;
            case 'sha384': _type = 'SHA-384'; break;
            case 'sha512': _type = 'SHA-512'; break;
            default: throw new Error('Unsupported algorithm.');
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(b4a.isBuffer(message) ? b4a.toString(message, 'utf-8') : message);
        // TODO: This will only work in Nodejs, because crypto is not defined in Bare environment. Fix this in future releases 
        const hash = await crypto.subtle.digest(_type, data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    } else {
        // this is only available here for completeness and in fact will never be used in the MSB.
        // just keep it as it is.
        return b4a.from(crypto.createHash(type).update(message).digest('hex'), 'hex');
    }
}

// TODO: should be moved to another message builder
export async function generateTx(bootstrap, msb_bootstrap, validator_address, local_writer_key, local_address, content_hash, nonce) {

    const tx = b4a.concat([
        b4a.from(bootstrap, 'hex'),
        b4a.from(msb_bootstrap, 'hex'),
        addressToBuffer(validator_address),
        b4a.from(local_writer_key, 'hex'),
        addressToBuffer(local_address),
        b4a.from(content_hash, 'hex'),
        b4a.from(nonce, 'hex')
    ]);

    return await createHash('sha256', await createHash('sha256', tx));
}

// TODO: should be moved to another message builder
export async function generatePreTx(walletInstance, validator_address, local_writer_key, local_address, content_hash, sub_network_bootstrap, msb_bootstrap) {
    const nonce = Wallet.generateNonce().toString('hex');
    const txHash = await generateTx(
        sub_network_bootstrap,
        msb_bootstrap,
        validator_address,
        local_writer_key,
        local_address,
        content_hash,
        nonce
    );

    const signature = walletInstance.sign(
        b4a.from(txHash, 'hex'),
        b4a.from(walletInstance.secretKey, 'hex')
    );

    return {
        op: OperationType.PRE_TX,
        tx: txHash.toString('hex'),
        ia: local_address.toString('hex'),
        iw: local_writer_key.toString('hex'),
        in: nonce,
        ch: content_hash,
        is: signature.toString('hex'),
        bs: sub_network_bootstrap,
        mbs: msb_bootstrap.toString('hex'),
        va: validator_address.toString('hex'),
    };
}
