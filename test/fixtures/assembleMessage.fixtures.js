import PeerWallet from 'trac-wallet';

export const mnemonicAdmin = "science edit ankle purity treat unable first express scatter depend also case nose regular rally area carbon wait power corn sibling metal crop farm";

export const writingKeyAdmin = "0768953b234c79eccc6306fdcba2d7c1f0b05b9af6815a3502e96a83a8878ff7";
export const writingKeyNonAdmin = "1768953b234c79eccc6306fdcba2d7c1f0b05b9af6815a3502e96a83a8878ff8";

export const bootstrapAdmin = writingKeyAdmin;

export const walletAdmin = new PeerWallet();
export const walletNonAdmin = new PeerWallet();

export const adminEntry = {
    tracPublicKey: null,
    wk: null,
}

export const initAll = async () => {
    await walletAdmin.generateKeyPair(mnemonicAdmin);
    await walletNonAdmin.generateKeyPair(walletNonAdmin.generateMnemonic());
    adminEntry.tracPublicKey = walletAdmin.publicKey;
    adminEntry.wk = writingKeyAdmin;
}

export default {
    mnemonicAdmin,
    writingKeyAdmin,
    writingKeyNonAdmin,
    bootstrapAdmin,
    walletAdmin,
    walletNonAdmin,
    adminEntry,
    initAll,
}