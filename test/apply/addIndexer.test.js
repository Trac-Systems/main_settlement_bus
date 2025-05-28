import { test, hook } from 'brittle';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { MainSettlementBus } from '../../src/index.js';
import { randomBytes } from 'crypto';
import PeerWallet from "trac-wallet";
import { EntryType } from "../../src/utils/constants.js";
import MsgUtils from '../../src/utils/msgUtils.js';
import fileUtils from '../../src/utils/fileUtils.js';
import { sleep } from '../../src/utils/functions.js';
import { tick } from '../utils/setupApplyTests.js';
import {testKeyPair1, testKeyPair2} from '../fixtures/apply.fixtures.js';

//TODO: create utils for tests, include Leo's tests approach for initializaion


let tmpDirectory, bootstrapKeyPairPath, peerKeyPath, advKeyPath;
let msbBootstrap, msbPeer;
let boostrapPeerWallet, peerWallet, adversaryWallet;

const setUpAdmin = async (msbBootstrap, bootstrap) => {
    const adminEntry = await msbBootstrap.state.get(EntryType.ADMIN);
    const addAdminMessage = await MsgUtils.assembleAdminMessage(adminEntry, msbBootstrap.state.writingKey, boostrapPeerWallet, bootstrap);

    await msbBootstrap.state.base.append(addAdminMessage);
    await tick();
};

const getMockWhitelistKeys = async () => {
    return [peerWallet.publicKey];
};

const setUpWhitelist = async (msbBootstrap, wallet) => {
    const adminEntry = await msbBootstrap.state.get(EntryType.ADMIN);
    const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, wallet);
    await msbBootstrap.state.base.append(assembledWhitelistMessages);
};

const setUpWriter = async (msbBootstrap, peerWritingKey, peerWallet) => {
    const assembledAddWriterMessage = await MsgUtils.assembleAddWriterMessage(peerWallet, peerWritingKey);
    await msbBootstrap.state.base.append(assembledAddWriterMessage);
    await tick();
};


hook('Initialize nodes', async t => {
    //init mocked directory structure
    tmpDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tempTestStore-'))

    const storesDirectory = tmpDirectory + '/stores/';
    const storeName = 'testBootstrapStore/';

    // Bootstrap store
    const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
    await fs.mkdir(corestoreDbDirectory, { recursive: true });
    // Bootstrap keypair files
    bootstrapKeyPairPath = path.join(corestoreDbDirectory, 'keypair.json');
    await fs.writeFile(bootstrapKeyPairPath, JSON.stringify(testKeyPair1, null, 2));

    // Writer store
    const writeStoreName = 'testWriterStore';
    const writerCorestoreDbDirectory = path.join(storesDirectory, writeStoreName, 'db');
    await fs.mkdir(writerCorestoreDbDirectory, { recursive: true });
    // Writer keypair files
    peerKeyPath = path.join(writerCorestoreDbDirectory, 'keypair.json');
    await fs.writeFile(peerKeyPath, JSON.stringify(testKeyPair2, null, 2));

    const msbInit = new MainSettlementBus({
        stores_directory: storesDirectory,
        store_name: storeName,
        channel: randomBytes(32).toString('hex'),
        bootstrap: randomBytes(32).toString('hex'),
        enable_txlogs: false,
        enableValidatorObserver: false,
        enableRoleRequester: false,
        replicate: false,
    });

    await msbInit.ready();
    const bootstrap = msbInit.state.writingKey;
    await msbInit.close();

    const channel = randomBytes(32).toString('hex');
    msbBootstrap = new MainSettlementBus({
        stores_directory: storesDirectory,
        store_name: storeName,
        channel:channel,
        bootstrap: bootstrap,
        enable_txlogs: true,
        enableValidatorObserver: false,
        enableRoleRequester: false,
        replicate: true,
    });

    await msbBootstrap.ready();
    msbPeer = new MainSettlementBus({
        stores_directory: storesDirectory,
        store_name: writeStoreName,
        channel: channel,
        bootstrap: bootstrap,
        enable_txlogs: true,
        enableValidatorObserver: false,
        enableRoleRequester: false,
        replicate: true,
    });

    await msbPeer.ready();

    // Initialization admin  and validator with writing role (Trac network) wallets for testing purposes
    boostrapPeerWallet = new PeerWallet();
    await boostrapPeerWallet.initKeyPair(bootstrapKeyPairPath);

    peerWallet = new PeerWallet();
    await peerWallet.initKeyPair(peerKeyPath);

    //set up admin entry
    await setUpAdmin(msbBootstrap, bootstrap);

    // set up whitelist
    const whitelistKeys = await getMockWhitelistKeys();
    const originalReadPublicKeysFromFile = fileUtils.readPublicKeysFromFile;
    fileUtils.readPublicKeysFromFile = async () => whitelistKeys;

    await setUpWhitelist(msbBootstrap, boostrapPeerWallet);
    //brittle does not support mock so we need to revert original function after initialization:
    fileUtils.readPublicKeysFromFile = originalReadPublicKeysFromFile;

    // peerMsb should become a writer (setUpWriter)
    await setUpWriter(msbBootstrap, msbPeer.state.writingKey, peerWallet);

})

//TODO write more tests
test('handleApplyAddWriterOperation (apply) - Append transaction into the base', async t => {
    t.plan(2)

    const indexerCandidate = peerWallet.publicKey;
    const assembledAddIndexerMessage = await MsgUtils.assembleAddIndexerMessage(boostrapPeerWallet, indexerCandidate);
    await msbBootstrap.state.append(assembledAddIndexerMessage);
    await tick();
    await sleep(5000);
    
    const indexers = await msbPeer.state.get(EntryType.INDEXERS);
    const nodeInfo = await msbPeer.state.get(indexerCandidate);

    t.is(Array.from(indexers).includes(indexerCandidate), true, 'Indexer candidate should be included in the indexers list');
    t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
})

hook('Clean up addIndexer setup', async t => {
    // close msbBoostrap and remove temp directory
    if (msbBootstrap) await msbBootstrap.close();
    if (msbPeer) await msbPeer.close();
    if (tmpDirectory) await fs.rm(tmpDirectory, { recursive: true, force: true })
})