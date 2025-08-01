import sodium from 'sodium-native';
import { generateMnemonic, mnemonicToSeed } from 'bip39-mnemonic';
import b4a from 'b4a'
import PeerWallet from "trac-wallet"
import path from 'path';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';

import { MainSettlementBus } from '../../src/index.js'
import fileUtils from '../../src/utils/fileUtils.js'
import { EntryType } from '../../src/utils/constants.js';
import { OperationType } from '../../src/utils/constants.js'
import { sleep } from '../../src/utils/helpers.js'
import { createHash } from '../../src/utils/crypto.js'
import { generateTx } from '../../src/utils/transactionUtils.js';
import { formatIndexersEntry } from '../../src/utils/helpers.js';
let os, fsp;

/**
 * Ensures that the environment is ready for file system and OS operations.
 */

async function ensureEnvReady() {
    if (!os || !fsp) {
        if (typeof globalThis.Bare !== 'undefined') {
            const bareOS = await import('bare-os');
            os = bareOS.default || bareOS;
            const bareFS = await import('bare-fs');
            fsp = (bareFS.default || bareFS).promises;
        } else {
            const nodeOS = await import('os');
            os = nodeOS.default || nodeOS;
            const nodeFS = await import('fs/promises');
            fsp = nodeFS.default || nodeFS;
        }
    }
}

export function randomBytes() {
    const buf = b4a.allocUnsafe(32);
    sodium.randombytes_buf(buf);
    return buf;
}

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
    admin.options.bootstrap = admin.msb.state.writingKey;
    await admin.msb.close();

    admin.msb = new MainSettlementBus(admin.options);
    return admin;
}

export async function setupMsbAdmin(keyPair, temporaryDirectory, options = {}) {
    const admin = await initMsbAdmin(keyPair, temporaryDirectory, options);

    await admin.msb.ready();
    const addAdminMessage = await StateMessageOperations.assembleAddAdminMessage(admin.msb.state.writingKey, admin.wallet);
    await admin.msb.state.append(addAdminMessage);
    await tick();
    return admin;
}

export async function setupNodeAsWriter(admin, writerCandidate) {
    try {
        await setupWhitelist(admin, [writerCandidate.wallet.address]); // ensure if is whitelisted

        const isWriter = async (address) => {
            const result = await admin.msb.state.getNodeEntry(address);
            return result && result.isWriter && !result.isIndexer;
        }

        const req = await StateMessageOperations.assembleAddWriterMessage(writerCandidate.wallet, writerCandidate.msb.state.writingKey);
        await admin.msb.state.append(req);
        await tick(); // wait for the request to be processed
        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            const res = await isWriter(writerCandidate.wallet.address);
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

export async function setupMsbWriter(admin, peerName, peerKeyPair, temporaryDirectory, options = {}) {
    try {
        const writerCandidate = await setupMsbPeer(peerName, peerKeyPair, temporaryDirectory, options);
        await setupWhitelist(admin, [writerCandidate.wallet.address]);

        const isWriter = async (address) => {
            const result = await admin.msb.state.getNodeEntry(address);
            return result && result.isWriter && !result.isIndexer;
        }

        const req = await StateMessageOperations.assembleAddWriterMessage(writerCandidate.wallet, writerCandidate.msb.state.writingKey);
        await admin.msb.state.append(req);
        await tick(); // wait for the request to be processed
        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            const res = await isWriter(writerCandidate.wallet.address);
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

export async function setupMsbIndexer(indexerCandidate, admin) {
    try {
        const req = await StateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexerCandidate.wallet.address);
        await admin.msb.state.append(req);
        await tick(); // wait for the request to be processed

        const isIndexer = async () => {
            const indexersEntry = await admin.msb.state.getIndexersEntry();
            if (!indexersEntry) {
                return false;
            }
            const formatted = formatIndexersEntry(indexersEntry);
            if (!formatted || !formatted.addresses) return false;
            return formatted.addresses.includes(indexerCandidate.wallet.address);
        }

        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            const res = await isIndexer(indexerCandidate.wallet.address);
            if (res) {
                break;
            }
            await sleep(1000); // wait for the peer to sync state
        }

        return indexerCandidate;
    }
    catch (error) {
        throw new Error('Error setting up MSB indexer: ', error.message);
    }
}

export async function setupWhitelist(admin, whitelistAddresses) {
    if (!admin || !admin.msb || !admin.wallet) {
        throw new Error('Admin is not properly initialized');
    }

    if (!Array.isArray(whitelistAddresses) || whitelistAddresses.length === 0) {
        throw new Error('Whitelist addresses must be a non-empty array');
    }

    const adminEntry = await admin.msb.state.get(EntryType.ADMIN);
    if (!adminEntry) {
        throw new Error('Admin is not initialized. Execute /add_admin command first.');
    }
    // set up mock whitelist
    const originalReadPublicKeysFromFile = fileUtils.readPublicKeysFromFile;
    fileUtils.readPublicKeysFromFile = async () => whitelistAddresses;
    const assembledWhitelistMessages = await StateMessageOperations.assembleAppendWhitelistMessages(admin.wallet);
    for (const [_, msg] of assembledWhitelistMessages.entries()) {
        await admin.msb.state.append(msg);
    }
    fileUtils.readPublicKeysFromFile = originalReadPublicKeysFromFile;
}

export async function initTemporaryDirectory() {
    await ensureEnvReady();
    const tmpDir = os.tmpdir();
    const unique = `tempTestStore-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const temporaryDirectory = path.join(tmpDir, unique);
    await fsp.mkdir(temporaryDirectory, { recursive: true });
    console.log('temporary directory: ', temporaryDirectory);
    return temporaryDirectory;
}

export async function removeTemporaryDirectory(temporaryDirectory) {
    await ensureEnvReady();
    await fsp.rm(temporaryDirectory, { recursive: true, force: true })
}

async function initDirectoryStructure(peerName, keyPair, temporaryDirectory) {
    try {
        await ensureEnvReady();
        const storesDirectory = temporaryDirectory + '/stores/';
        const storeName = peerName + '/';
        const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
        await fsp.mkdir(corestoreDbDirectory, { recursive: true });

        const keypath = path.join(corestoreDbDirectory, 'keypair.json');
        if (!keyPair || !keyPair.publicKey || !keyPair.secretKey) {
            keyPair = await randomKeypair();
        }
        await fsp.writeFile(keypath, JSON.stringify(keyPair, null, 2));
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
        await ensureEnvReady();
        // Check if the file exists, if not create it
        await fsp.mkdir(path.dirname(filepath), { recursive: true })
        // Append the key to the file, followed by a newline
        await fsp.appendFile(filepath, key + '\n', { encoding: 'utf8' });
    } catch (error) {
        throw new Error('Error adding key to whitelist: ' + error);
    }
}

export async function restoreWhitelistFromBackup(filepath) {
    const backupPath = filepath + '.bak';
    try {
        await ensureEnvReady();
        // Check if the backup file exists
        await fsp.access(backupPath);
        // Remove the current file if it exists
        try {
            await fsp.unlink(filepath);
        } catch (e) {
            // File may not exist, that's fine
        }
        // Rename the backup back to the original filename
        await fsp.rename(backupPath, filepath);
    } catch (e) {
        // Backup does not exist, nothing to restore
    }
}

export const generatePostTx = async (msbBootstrap, boostrapPeerWallet, peerWallet) => {

    const peerBootstrap = randomBytes(32).toString('hex');
    const validatorPubKey = msbBootstrap.tracPublicKey;
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

    const preTxHash = await generateTx(
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
            op: OperationType.TX,
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
            wp: parsedPreTx.wp,
            wn: nonce
        }
    };

    return { postTx, preTxHash };

}

/*
    You can synchronize multiple nodes by passing them as arguments,
    Useful for aligning signedLength values. If node is not a writer, it will be skipped.
*/
export const tryToSyncWriters = async (...args) => {
    try {
        const N = 100;
        for (let i = 0; i < N; i++) {
            for (const node of args) {
                await sleep(50)
                await node.msb.state.append(null);
            }
            await tick();
        }

    } catch (error) {
        console.log('node is not a writer', error);
    }
}

export async function waitForNotIndexer(indexer, maxAttempts = 30, delayMs = 1000) {

    const isNotIndexer = async () => {
        const indexersEntry = await indexer.msb.state.getIndexersEntry();
        if (!indexersEntry) {
            return false;
        }
        const formatted = formatIndexersEntry(indexersEntry);
        if (!formatted || !formatted.addresses) return false;

        const nodeEntry = await indexer.msb.state.getNodeEntry(indexer.wallet.address);
        if (!nodeEntry) return false;
        return !nodeEntry.isIndexer && !formatted.addresses.includes(indexer.wallet.address);
    }

    for (let counter = 0; counter < maxAttempts; counter++) {
        const res = await isNotIndexer(indexer.wallet.address);
        if (res) {
            return true;
        }
        await sleep(delayMs);
    }
    return false;
}
