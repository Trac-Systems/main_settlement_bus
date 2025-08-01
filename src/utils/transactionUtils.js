import b4a from 'b4a';
import { createHash } from './crypto.js';
import { addressToBuffer } from '../core/state/utils/address.js';
import Wallet from 'trac-wallet';
import { OperationType } from './constants.js';

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

export async function generatePreTx(
    walletInstance,
    validator_address,
    local_writer_key,
    local_address,
    content_hash,
    sub_network_bootstrap,
    msb_bootstrap
) {
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
        ch: content_hash.toString('hex'),
        is: signature.toString('hex'),
        bs: sub_network_bootstrap,
        mbs: msb_bootstrap.toString('hex'),
        va: validator_address.toString('hex'),
    };
}
