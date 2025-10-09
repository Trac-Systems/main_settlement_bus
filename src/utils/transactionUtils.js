import b4a from 'b4a';
import PeerWallet from 'trac-wallet';
import { addressToBuffer } from '../core/state/utils/address.js';
import { OperationType } from './constants.js';
import { blake3Hash } from './crypto.js';
import { createMessage } from '../../src/utils/buffer.js';

export async function generateTx(bootstrap, msb_bootstrap, local_writer_key, local_address, content_hash, nonce) {
    const tx = b4a.concat([
        b4a.from(bootstrap, 'hex'),
        b4a.from(msb_bootstrap, 'hex'),
        b4a.from(local_writer_key, 'hex'),
        addressToBuffer(local_address),
        b4a.from(content_hash, 'hex'),
        b4a.from(nonce, 'hex')
    ]);

    return await blake3Hash(tx);
}

export async function generatePreTx(
    walletInstance,
    validator_address,
    local_writer_key,
    local_address,
    content_hash,
    sub_network_bootstrap,
    msb_bootstrap,
    validity
) {
    const nonce = PeerWallet.generateNonce().toString('hex');
    const msg = await createMessage(
        addressToBuffer(local_address), // this is probably wrong
        validity,
        b4a.from(local_writer_key, 'hex'),
        content_hash,
        b4a.from(nonce, 'hex'),
        b4a.from(sub_network_bootstrap, 'hex'),
        msb_bootstrap,
        OperationType.TX
        /*
        sub_network_bootstrap,
        msb_bootstrap,
        validator_address,
        local_writer_key,
        local_address,
        content_hash,
        nonce
        */
    );

    const txHash = await blake3Hash(msg)
    const signature = walletInstance.sign(
        txHash,
        b4a.from(walletInstance.secretKey, 'hex')
    );

    return {
        op: OperationType.TX,
        tx: txHash.toString('hex'),
        ia: local_address.toString('hex'),
        iw: local_writer_key.toString('hex'),
        in: nonce,
        ch: content_hash.toString('hex'),
        is: signature.toString('hex'),
        bs: sub_network_bootstrap,
        mbs: msb_bootstrap.toString('hex'),
        va: validator_address.toString('hex'),
    };
}
