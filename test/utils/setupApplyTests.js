import sodium from 'sodium-native';
import {generateMnemonic, mnemonicToSeed} from 'bip39-mnemonic';
import b4a from 'b4a'
import PeerWallet from "trac-wallet"
import path from 'path';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';

import {MainSettlementBus} from '../../src/index.js'
import fileUtils from '../../src/utils/fileUtils.js'
import {EntryType} from '../../src/utils/constants.js';
import {sleep} from '../../src/utils/helpers.js'
import {formatIndexersEntry} from '../../src/utils/helpers.js';
import {generatePreTx} from '../../src/utils/transactionUtils.js';
import {blake3Hash} from '../../src/utils/crypto.js';

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

export function randomBytes(num) {
    const buf = b4a.allocUnsafe(num);
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
    await wallet.initKeyPair(peer.keypath);
    peer.msb = msb;
    peer.wallet = wallet;
    peer.name = peerName;

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
    const addAdminMessage = await CompleteStateMessageOperations.assembleAddAdminMessage(admin.wallet, admin.msb.state.writingKey);
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

        const req = await CompleteStateMessageOperations.assembleAddWriterMessage(writerCandidate.wallet, writerCandidate.msb.state.writingKey);
        await admin.msb.state.append(req);
        await tick(); // wait for the request to be processed
        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            if (await isWriter(writerCandidate.wallet.address) && await writerCandidate.msb.state.isWritable()) {
                break;
            }
            await writerCandidate.msb.state.base.update();
            await writerCandidate.msb.state.base.view.update();
            await writerCandidate.msb.network.swarm.flush()
            await sleep(1000); // wait for the peer to sync state
        }

        return writerCandidate;
    } catch (error) {
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

        const req = await CompleteStateMessageOperations.assembleAddWriterMessage(writerCandidate.wallet, writerCandidate.msb.state.writingKey);
        await admin.msb.state.append(req);
        await tick(); // wait for the request to be processed
        let counter;
        const limit = 10; // maximum number of attempts to verify the role
        for (counter = 0; counter < limit; counter++) {
            if (await isWriter(writerCandidate.wallet.address) && await writerCandidate.msb.state.isWritable()) {
                break;
            }
            await writerCandidate.msb.state.base.update();
            await writerCandidate.msb.state.base.view.update();
            await writerCandidate.msb.network.swarm.flush()
            await sleep(1000); // wait for the peer to sync state
        }

        return writerCandidate;
    } catch (error) {
        throw new Error('Error setting up MSB writer: ', error.message);
    }
}


export async function setupMsbIndexer(indexerCandidate, admin) {
    try {
        const req = await CompleteStateMessageOperations.assembleAddIndexerMessage(admin.wallet, indexerCandidate.wallet.address);
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
            if (await isIndexer(indexerCandidate.wallet.address) && await indexerCandidate.msb.state.isIndexer()) {
                break;
            }
            await indexerCandidate.msb.state.append(null);
            await indexerCandidate.msb.state.base.update();
            await indexerCandidate.msb.state.base.view.update();
            await indexerCandidate.msb.network.swarm.flush()
            await sleep(1000); // wait for the peer to sync state
        }

        return indexerCandidate;
    } catch (error) {
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
    const assembledWhitelistMessages = await CompleteStateMessageOperations.assembleAppendWhitelistMessages(admin.wallet);
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
    await fsp.mkdir(temporaryDirectory, {recursive: true});
    console.log('temporary directory: ', temporaryDirectory);
    return temporaryDirectory;
}

export async function removeTemporaryDirectory(temporaryDirectory) {
    await ensureEnvReady();
    await fsp.rm(temporaryDirectory, {recursive: true, force: true})
}

export async function initDirectoryStructure(peerName, keyPair, temporaryDirectory) {
    try {
        await ensureEnvReady();
        const storesDirectory = temporaryDirectory + '/stores/';
        const storeName = peerName + '/';
        const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
        await fsp.mkdir(corestoreDbDirectory, {recursive: true});

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
    } catch (error) {
        throw new Error('Error creating directory structure: ' + error)
    }
}

export const generatePostTx = async (writer, externalNode) => {
    const externalContractBootstrap = randomBytes(32).toString('hex');
    const validatorAddress = writer.wallet.address;

    const peerWriterKey = randomBytes(32).toString('hex');
    const peerAddress = externalNode.wallet.address;

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

    const contentHash = await blake3Hash(JSON.stringify(testObj));
    const preTx = await generatePreTx(
        externalNode.wallet,
        validatorAddress,
        peerWriterKey,
        peerAddress,
        contentHash,
        externalContractBootstrap,
        writer.msb.bootstrap
    );

    const postTx = await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
        writer.wallet,
        preTx.va,
        b4a.from(preTx.tx, 'hex'),
        preTx.ia,
        b4a.from(preTx.iw, 'hex'),
        b4a.from(preTx.in, 'hex'),
        b4a.from(preTx.ch, 'hex'),
        b4a.from(preTx.is, 'hex'),
        b4a.from(preTx.bs, 'hex'),
        b4a.from(preTx.mbs, 'hex')
    );

    const txHash = preTx.tx;

    return {postTx, txHash};

}

/**
 * You can synchronize multiple nodes by passing them as arguments,
 * Useful for aligning signedLength values. If node is not a writer, it will be skipped.
 *
 * @example
 * await tryToSyncWriters(admin, writer1, writer2, indexer1);
 */
export const tryToSyncWriters = async (...args) => {
    try {
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
            let maxLength = Math.max(...args.map(node => node.msb.state.getSignedLength()));
            let allSynced = true;
            for (const node of args) {
                let signedLength = node.msb.state.getSignedLength();
                if (signedLength < maxLength) {
                    //await node.msb.state.append(null);
                    await node.msb.state.base.update();
                    await node.msb.state.base.view.update();
                    await node.msb.network.swarm.flush()
                    await sleep(1000);
                    allSynced = false;
                }
            }
            if (allSynced) break;
            attempts++;
        }
    } catch (error) {
        throw new Error("Error synchronizing writers: " + error.message);
    }
}


export async function waitForNotIndexer(indexer) {
    try {
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
            await indexer.msb.state.base.update();
            await indexer.msb.state.base.view.update();
            const indexersEntry = await indexer.msb.state.getIndexersEntry();
            let notIndexer = false;
            if (!indexersEntry) {
                notIndexer = true;
            } else {
                const formatted = formatIndexersEntry(indexersEntry);
                if (!formatted || !formatted.addresses) {
                    notIndexer = true;
                } else if (!formatted.addresses.includes(indexer.wallet.address)) {
                    notIndexer = true;
                }
            }
            if (notIndexer) {
                break;
            }
            await indexer.msb.network.swarm.flush()
            await sleep(1000);
            attempts++;
        }
    } catch (error) {
        throw new Error("Error waiting for indexer to not be an indexer: " + error.message);
    }
}

/**
 * Waits until the given node sees the expected state for a target address.
 *
 * @param {object} node - The node whose state will be checked (the observer).
 * @param {string} address - The address whose state we want to observe.
 * @param {object} expected - Object with properties: wk (Buffer), isWhitelisted (boolean), isWriter (boolean), isIndexer (boolean)
 * @returns {Promise<void>} Resolves when the observed state matches expected values.
 *
 * @example
 * await waitForRemoteNodeState(writer1, writer2.wallet.address, {
 *   wk: writer2.msb.state.writingKey,
 *   isWhitelisted: true,
 *   isWriter: true,
 *   isIndexer: false
 * });
 */

export async function waitForNodeState(node, address, expected) {
    try {
        await node.msb.state.base.flush()
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
            const state = await node.msb.state.getNodeEntry(address);
            if (
                state &&
                b4a.equals(state.wk, expected.wk) &&
                state.isWhitelisted === (expected.isWhitelisted ?? expected.isWhiteListed) &&
                state.isWriter === expected.isWriter &&
                state.isIndexer === expected.isIndexer
            ) {
                return;
            }
            await node.msb.network.swarm.flush()
            await sleep(1000);
            attempts++;
        }
    } catch (error) {
        throw new Error("Error synchronizing node state: " + error.message);
    }
}

export async function waitForAdminEntry(node, expected) {
    try {
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
            const adminEntry = await node.msb.state.getAdminEntry();
            if (
                adminEntry &&
                b4a.equals(adminEntry.wk, expected.wk) &&
                adminEntry.address === expected.address
            ) {
                break;
            }
            await node.msb.network.swarm.flush()
            await sleep(1000);
            attempts++;
        }
    } catch (error) {
        throw new Error('Error waiting for admin entry: ' + error.message);
    }
}

export async function waitForIndexersEntry(node, expected) {
    try {
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
            const indexersEntry = await node.msb.state.getIndexersEntry();
            if (!indexersEntry) {
                attempts++;
                await sleep(250);
                continue;
            }
            const formatted = formatIndexersEntry(indexersEntry);
            if (formatted && formatted.addresses && formatted.addresses.includes(expected.address)) {
                break;
            }
            await sleep(250);
            attempts++;
        }
    } catch (error) {
        throw new Error("Error waiting for indexers entry: " + error.message);
    }

}
