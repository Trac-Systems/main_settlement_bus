import { MainSettlementBus } from '../../src/index.js'
import fileUtils from '../../src/utils/fileUtils.js'
import MsgUtils from '../../src/utils/msgUtils.js'
import { EntryType } from '../../src/utils/constants.js';
import { OperationType } from '../../src/utils/constants.js'
import { createHash, sleep } from '../../src/utils/functions.js'
import sodium from 'sodium-native';
import { generateMnemonic, validateMnemonic, mnemonicToSeed } from 'bip39-mnemonic';
import b4a from 'b4a'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import PeerWallet from "trac-wallet"
import { randomBytes } from 'crypto'
import { request } from 'http';

async function randomKeypair() {
    const keypair = {};
    const mnemonic = generateMnemonic();
    const seed = await mnemonicToSeed(mnemonic);

    const publicKey = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = b4a.alloc(sodium.crypto_sign_SECRETKEYBYTES);

    const hash = b4a.alloc(sodium.crypto_hash_sha256_BYTES);
    sodium.crypto_hash_sha256(hash, b4a.from(seed));

    const seed32 = b4a.from(hash, 'hex');

    sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed32);

    keypair.publicKey = publicKey;
    keypair.secretKey = secretKey;
    return keypair;
}

export const tick = () => new Promise(resolve => setImmediate(resolve));

export async function initMsbPeer(peerName, peerKeyPair, temporaryDirectory, options = {}) {
    const peer = await initDirectoryStructure(peerName, peerKeyPair, temporaryDirectory);
    peer.options = options
    peer.options.stores_directory = peer.storesDirectory;
    peer.options.store_name = peer.storeName;

    const msb = new MainSettlementBus(peer.options);

    const wallet = new PeerWallet();
    wallet.initKeyPair(peer.keypath);

    peer.msb = msb;
    peer.wallet = wallet;

    return peer;
}

export async function setupMsbPeer(peerName, peerKeyPair, temporaryDirectory, options = {}) {
    const peer = await initMsbPeer(peerName, peerKeyPair, temporaryDirectory, options);
    await peer.msb.ready();
    return peer;
}

export async function initMsbAdmin(keyPair, temporaryDirectory, options = {}) {
    const peerName = 'admin';
    const admin = await initMsbPeer(peerName, keyPair, temporaryDirectory, options);

    await admin.msb.ready();
    admin.options.bootstrap = admin.msb.writingKey;
    await admin.msb.close();

    admin.msb = new MainSettlementBus(admin.options);
    return admin;
}

export async function setupAdmin(keyPair, temporaryDirectory, options = {}) {
    const admin = await initMsbAdmin(keyPair, temporaryDirectory, options);

    await admin.msb.ready();
    const adminEntry = await admin.msb.get(EntryType.ADMIN)
    const addAdminMessage = await MsgUtils.assembleAdminMessage(adminEntry, admin.msb.writingKey, admin.wallet, admin.options.bootstrap);
    await admin.msb.base.append(addAdminMessage);
    await tick();
    return admin;
}

export async function setupMsbWriter(admin, peerName, peerKeyPair, temporaryDirectory, options = {}) {
    try {
        const writerCandidate = await setupMsbPeer(peerName, peerKeyPair, temporaryDirectory, options);
        await setupWhitelist(admin, [writerCandidate.wallet.publicKey]);

        const isWriter = async (key) => {
            const result = await admin.msb.get(key);
            return result && result.isWriter && !result.isIndexer;
        }

        const req = await MsgUtils.assembleAddWriterMessage(writerCandidate.wallet, writerCandidate.msb.writingKey);
        await admin.msb.base.append(req);
        await tick(); // wait for the request to be processed

        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            const res = await isWriter(req.key);
            if (res) {
                break;
            }
            await sleep(1000); // wait for the peer to sync state
        }

        return writerCandidate;
    }
    catch (error) {
        throw new Error('Error setting up MSB writer: ', error.message);
    }
}

export async function setupMsbIndexer(indexerCandidate, admin, peerName, peerKeyPair, temporaryDirectory, options = {}) {
    try {
        const req = await MsgUtils.assembleAddIndexerMessage(admin.wallet, indexerCandidate.wallet.publicKey);
        await admin.msb.base.append(req);
        await tick(); // wait for the request to be processed

        const isIndexer = async () => {
            const indexers = await admin.msb.get(EntryType.INDEXERS)
            if (!indexers) {
                return false;
            }
            // Check if the peer's public key is in the indexers list
            return Array.from(indexers).includes(indexerCandidate.wallet.publicKey);
        }

        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            const res = await isIndexer(req.key);
            if (res) {
                break;
            }
            await sleep(1000); // wait for the peer to sync state
        }

        return indexerCandidate;
    }
    catch (error) {
        throw new Error('Error setting up MSB indexer:', error.message);
    }
}

export async function setupWhitelist(admin, whitelistKeys) {
    if (!admin || !admin.msb || !admin.wallet) {
        throw new Error('Admin is not properly initialized');
    }

    if (!Array.isArray(whitelistKeys) || whitelistKeys.length === 0) {
        throw new Error('Whitelist keys must be a non-empty array');
    }

    const adminEntry = await admin.msb.get(EntryType.ADMIN);
    if (!adminEntry) {
        throw new Error('Admin is not initialized. Execute /add_admin command first.');
    }

    // set up mock whitelist
    const originalReadPublicKeysFromFile = fileUtils.readPublicKeysFromFile;
    fileUtils.readPublicKeysFromFile = async () => whitelistKeys;
    const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, admin.wallet);
    await admin.msb.base.append(assembledWhitelistMessages);
    fileUtils.readPublicKeysFromFile = originalReadPublicKeysFromFile;
}

export async function initTemporaryDirectory() {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tempTestStore-'));
    console.log('temporary directory: ', temporaryDirectory);
    return temporaryDirectory;
}

export async function removeTemporaryDirectory(temporaryDirectory) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
}

async function initDirectoryStructure(peerName, keyPair, temporaryDirectory) {
    try {
        const storesDirectory = temporaryDirectory + '/stores/';
        const storeName = peerName + '/';
        const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
        await fs.mkdir(corestoreDbDirectory, { recursive: true });

        const keypath = path.join(corestoreDbDirectory, 'keypair.json');
        if (!keyPair || !keyPair.publicKey || !keyPair.secretKey) {
            keyPair = await randomKeypair();
        }
        await fs.writeFile(keypath, JSON.stringify(keyPair, null, 2));
        return {
            storesDirectory,
            storeName,
            corestoreDbDirectory,
            keypath,
        }
    }
    catch (error) {
        throw new Error('Error creating directory structure: ' + error)
    }
}

export async function addKeyToWhitelist(filepath, key) {
    try {
        // Ensure the directory exists
        await fs.mkdir(path.dirname(filepath), { recursive: true });

        // If the file exists, rename it to <filename>.bak
        try {
            await fs.access(filepath);
            await fs.rename(filepath, filepath + '.bak');
        } catch (e) {
            // File does not exist, no need to rename
        }

        // Append the key to the file, followed by a newline
        await fs.appendFile(filepath, key + '\n', { encoding: 'utf8' });
    } catch (error) {
        throw new Error('Error adding key to whitelist: ' + error);
    }
}

export async function restoreWhitelistFromBackup(filepath) {
    const backupPath = filepath + '.bak';
    try {
        // Check if the backup file exists
        await fs.access(backupPath);
        // Remove the current file if it exists
        try {
            await fs.unlink(filepath);
        } catch (e) {
            // File may not exist, that's fine
        }
        // Rename the backup back to the original filename
        await fs.rename(backupPath, filepath);
    } catch (e) {
        // Backup does not exist, nothing to restore
    }
}

export const generatePostTx = async (msbBootstrap, boostrapPeerWallet, peerWallet) => {

    const peerBootstrap = randomBytes(32).toString('hex');
    const validatorPubKey = msbBootstrap.getTracPublicKey();
    const peerWriterKey = randomBytes(32).toString('hex');
    const peerPublicKey = peerWallet.publicKey;

    const testObj = {
        type: 'deployTest',
        value: {
            op: 'deploy',
            tick: Math.random().toString(),
            max: '21000000',
            lim: '1000',
            dec: 18
        }
    };

    const contentHash = await createHash('sha256', JSON.stringify(testObj));
    const nonce = PeerWallet.generateNonce().toString('hex');

    const preTxHash = await msbBootstrap.generateTx(
        peerBootstrap,
        msbBootstrap.bootstrap,
        validatorPubKey,
        peerWriterKey,
        peerPublicKey,
        contentHash,
        nonce
    );

    const parsedPreTx = {
        op: 'pre-tx',
        tx: preTxHash,
        is: peerWallet.sign(Buffer.from(preTxHash + nonce)),
        wp: validatorPubKey,
        i: peerWriterKey,
        ipk: peerPublicKey,
        ch: contentHash,
        in: nonce,
        bs: peerBootstrap,
        mbs: msbBootstrap.bootstrap
    };

    const postTxSig = boostrapPeerWallet.sign(
        b4a.from(parsedPreTx.tx + nonce),
        b4a.from(boostrapPeerWallet.secretKey, 'hex')
    );

    const postTx = {
        type: OperationType.TX,
        key: preTxHash,
        value: {
            op: OperationType.POST_TX,
            tx: preTxHash,
            is: parsedPreTx.is,
            w: msbBootstrap.bootstrap,
            i: parsedPreTx.i,
            ipk: parsedPreTx.ipk,
            ch: parsedPreTx.ch,
            in: parsedPreTx.in,
            bs: parsedPreTx.bs,
            mbs: parsedPreTx.mbs,
            ws: postTxSig.toString('hex'),
            wp: boostrapPeerWallet.publicKey,
            wn: nonce
        }
    };

    return { postTx, preTxHash };

}