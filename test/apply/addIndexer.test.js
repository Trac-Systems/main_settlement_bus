import { test, hook } from 'brittle'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { MainSettlementBus } from '../../src/index.js'
import { randomBytes } from 'crypto'
import PeerWallet from "trac-wallet"
import { EntryType } from "../../src/utils/constants.js"
import MsgUtils from '../../src/utils/msgUtils.js'
import fileUtils from '../../src/utils/fileUtils.js'
import { sleep } from '../../src/utils/functions.js'

//TODO move keys to fixtures, create utils for tests, include Leo's tests approach for initializaion
const bootstrapKeyPair = {
    publicKey: '82f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3',
    secretKey: '734aa8a4ff1506a502054f537c235d3fbe70452926bad869c3ab57e90d06df7382f6c1f684f4e251dfe092155b8861a0625b596991810b2b80b9c65ccbec5ad3',
    mnemonic: 'slight wedding permit mention subject mask hawk awkward sniff leopard spider scatter close neutral deny apple wide category sick love sorry pupil then legal'
}

const peerKeyPair = {
    publicKey: "8f17ec2862c7b3e4dbbedaf88a68a9b74d76e9d6acca6ca4a5fafb1b6c474616",
    secretKey: "21b7f3c56eaa4d8114530258c79b8086bcca3e61d6c9edee589e8ca2f48688e98f17ec2862c7b3e4dbbedaf88a68a9b74d76e9d6acca6ca4a5fafb1b6c474616",
    mnemonic: "century category maze cover student upset trip cup purchase area turtle keen minimum flee diagram romance stool absorb umbrella phone valve avocado fade window"
}

let tmp, bootstrapKeyPairPath, peerKeyPath, advKeyPath, msbBootstrap, msbPeer, boostrapPeerWallet, peerWallet, adversaryWallet

const tick = () => new Promise(resolve => setImmediate(resolve))

const setUpAdmin = async (msbBootstrap, bootstrap) => {
    const adminEntry = await msbBootstrap.get(EntryType.ADMIN)
    const addAdminMessage = await MsgUtils.assembleAdminMessage(adminEntry, msbBootstrap.writingKey, boostrapPeerWallet, bootstrap);

    await msbBootstrap.base.append(addAdminMessage);
    await tick();
};

const getMockWhitelistKeys = async () => {
    return [peerWallet.publicKey];
};

const setUpWhitelist = async (msbBootstrap, wallet) => {
    const adminEntry = await msbBootstrap.get(EntryType.ADMIN)
    const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, wallet);
    await msbBootstrap.base.append(assembledWhitelistMessages);
};

const setUpWriter = async (msbBootstrap, peerWritingKey, peerWallet) => {
    const assembledAddWriterMessage = await MsgUtils.assembleAddWriterMessage(peerWallet, peerWritingKey);
    await msbBootstrap.base.append(assembledAddWriterMessage);
    await tick();
}


hook('Initialize nodes', async t => {
    //init mocked directory structure
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tempTestStore-'))

    const storesDirectory = tmp + '/stores/';
    const storeName = 'testBootstrapStore/';

    // Bootstrap store
    const corestoreDbDirectory = path.join(storesDirectory, storeName, 'db');
    await fs.mkdir(corestoreDbDirectory, { recursive: true });
    // Bootstrap keypair files
    bootstrapKeyPairPath = path.join(corestoreDbDirectory, 'keypair.json');
    await fs.writeFile(bootstrapKeyPairPath, JSON.stringify(bootstrapKeyPair, null, 2));

    // Writer store
    const writeStoreName = 'testWriterStore';
    const writerCorestoreDbDirectory = path.join(storesDirectory, writeStoreName, 'db');
    await fs.mkdir(writerCorestoreDbDirectory, { recursive: true });
    // Writer keypair files
    peerKeyPath = path.join(writerCorestoreDbDirectory, 'keypair.json');
    await fs.writeFile(peerKeyPath, JSON.stringify(peerKeyPair, null, 2));

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
    const bootstrap = msbInit.writingKey;
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
    await setUpWriter(msbBootstrap, msbPeer.writingKey, peerWallet);

})

//TODO write more tests
test('handleApplyAddWriterOperation (apply) - Append transaction into the base', async t => {
    t.plan(2)

    const indexerCandidate = peerWallet.publicKey;
    const assembledAddIndexerMessage = await MsgUtils.assembleAddIndexerMessage(boostrapPeerWallet, indexerCandidate);
    await msbBootstrap.base.append(assembledAddIndexerMessage);
    await tick();
    await sleep(5000);
    
    const indexers = await msbPeer.get(EntryType.INDEXERS);
    const nodeInfo = await msbPeer.get(indexerCandidate);

    t.is(Array.from(indexers).includes(indexerCandidate), true, 'Indexer candidate should be included in the indexers list');
    t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
})

hook('Clean up addIndexer setup', async t => {
    // close msbBoostrap and remove temp directory
    if (msbBootstrap) await msbBootstrap.close();
    if (msbPeer) await msbPeer.close();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true })
})