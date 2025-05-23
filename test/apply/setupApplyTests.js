import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { MainSettlementBus } from '../../src/index.js'
import PeerWallet from "trac-wallet"
import fileUtils from '../../src/utils/fileUtils.js'
import MsgUtils from '../../src/utils/msgUtils.js'
import { EntryType } from '../../src/utils/constants.js';

export const tick = () => new Promise(resolve => setImmediate(resolve));

export async function baseSetup(test) {
    try {
        // TODO: Make this function more complete.
        // It should set the standard environment for MSB apply tests.
        const admin = await initMsbAdmin();
        return admin;
    }
    catch (error) {
        test.fail('Base setup error: ' + error)
    }
}

export async function initMsbPeer(peerName, peerKeyPair, options = {}) {
    const peer = await initDirectoryStructure(peerName, peerKeyPair);
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

export async function setupMsbPeer(peerName, peerKeyPair, options = {}) {
    const peer = await initMsbPeer(peerName, peerKeyPair, options);
    await peer.msb.ready();
    return peer;
}

export async function initMsbAdmin(keyPair, options = {}) {
    const admin = await initMsbPeer('admin', keyPair, options);

    await admin.msb.ready();
    admin.options.bootstrap = admin.msb.writingKey;
    await admin.msb.close();

    admin.msb = new MainSettlementBus(admin.options);
    return admin;
}

export async function setupAdmin(keyPair, options = {}) {
    const admin = await initMsbAdmin(keyPair, options);
    await admin.msb.ready();
    await admin.msb.handleCommand('/add_admin');
    return admin;
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

async function initDirectoryStructure(peerName, keyPair) {
    try {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tempTestStore-'));
        console.log('tmp dir', tmp);

        const storesDirectory = tmp + '/stores/';
        const storeName = peerName + '/';
        const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
        await fs.mkdir(corestoreDbDirectory, { recursive: true });

        const keypath = path.join(corestoreDbDirectory, 'keypair.json');
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