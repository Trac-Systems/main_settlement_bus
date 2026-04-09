import PeerWallet from 'trac-wallet';
import { config } from './config.js';

export async function createSignature(payloadBuffer) {
    const wallet = new PeerWallet({ derivationPath: config.derivationPath });
    await wallet.generateKeyPair(undefined, config.derivationPath);
    const signature = wallet.sign(payloadBuffer);
    return { signature, wallet };
}

export default {
    createSignature
};
