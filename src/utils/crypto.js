import sodium from 'sodium-native';
import b4a from 'b4a';

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
        //return crypto.createHash(type).update(!b4a.isBuffer(message) ? b4a.from(message) : message).digest('hex')
        return b4a.from(crypto.createHash(type).update(message).digest('hex'), 'hex');

    }
}

export async function generateTx(bootstrap, msb_bootstrap, validator_writer_key, local_writer_key, local_public_key, content_hash, nonce) {
    let tx = bootstrap + '-' +
        msb_bootstrap + '-' +
        validator_writer_key + '-' +
        local_writer_key + '-' +
        local_public_key + '-' +
        content_hash + '-' +
        nonce;
    return await createHash('sha256', await createHash('sha256', tx));
}
