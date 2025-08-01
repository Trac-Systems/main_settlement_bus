import { test, hook } from 'brittle';
import b4a from 'b4a';
import Wallet from 'trac-wallet';

import { setupMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, randomBytes } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import fileUtils from '../../src/utils/fileUtils.js';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';


let admin, whitelistKeys, tmpDirectory, originalReadPublicKeysFromFile;
const address = Wallet.encodeBech32m(b4a.from(testKeyPair2.publicKey, 'hex'));
hook('Initialize admin node for addWhitelist tests', async () => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txchannels: false,
        enable_txlogs: false,
        enable_interactive_mode: false,
        enable_role_requester: false,
        channel: randomChannel,
    }
    tmpDirectory = await initTemporaryDirectory();

    // Configure admin
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    await admin.msb.ready();

    // Configure whitelist
    whitelistKeys = [address];
    originalReadPublicKeysFromFile = fileUtils.readPublicKeysFromFile;
    fileUtils.readPublicKeysFromFile = async () => whitelistKeys;
});

test('Apply function addWhitelist - happy path', async (t) => {
    const assembledWhitelistMessages = await StateMessageOperations.assembleAppendWhitelistMessages(admin.wallet);
    const payload = assembledWhitelistMessages.get(address);

    await admin.msb.state.append(payload);
    const isWhitelisted = await admin.msb.state.isAddressWhitelisted(address);
    t.is(isWhitelisted, true, 'Whitelist entry should be created and true');
});

//TODO: ADD TEST TO APPEND ADDRESS WHICH IS ALREADY WHITELISTED - SIGNED LENGTH SHOULD NOT CHANGE

hook('Cleanup after addWhitelist tests', async () => {
    if (admin && admin.msb) {
        await admin.msb.close();
    }
    if (tmpDirectory) {
        await removeTemporaryDirectory(tmpDirectory);
    }
    fileUtils.readPublicKeysFromFile = originalReadPublicKeysFromFile;
});