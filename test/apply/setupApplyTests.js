import test from 'brittle'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js'
import { MainSettlementBus } from '../../src/index.js'
import { OperationType } from '../../src/utils/constants.js'
import { createHash } from '../../src/utils/functions.js'
import b4a from 'b4a'
import { randomBytes } from 'crypto'
import PeerWallet from "trac-wallet"

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

export async function initMsbPeer(peerName, peerKeyPair, options) {
    const peer = await initDirectoryStructure(peerName, peerKeyPair);
    peer.options = options
    peer.options.stores_directory = peer.storesDirectory;
    peer.options.store_name = peer.storeName;

    const msb = new MainSettlementBus(peer.options);

    const wallet = new PeerWallet();
    wallet.initKeyPair(peer.keyPath);
    
    peer.msb = msb;
    peer.wallet = wallet;

    return peer;
}

export async function initMsbAdmin(keyPair) {
    const admin = await initMsbPeer('admin', keyPair);

    await admin.msb.ready();
    admin.options.bootstrap = admin.msb.writingKey;
    await admin.msb.close();

    admin.msb = new MainSettlementBus(admin.options);
    return admin;
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