import { test, hook } from 'brittle';
import { setupMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import fileUtils from '../../src/utils/fileUtils.js';
import MsgUtils from '../../src/utils/msgUtils.js';
import { EntryType, WHITELIST_PREFIX } from '../../src/utils/constants.js';

let admin, whitelistKeys, tmpDirectory, originalReadPublicKeysFromFile;
hook('Initialize admin node for addWhitelist tests', async () => {
    const baseOptions = {
        enable_txchannels: false,
        enable_txlogs: false,
        enable_interactive_mode: false,
    }
    tmpDirectory = await initTemporaryDirectory();

    // Configure admin
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    await admin.msb.ready();

    // Configure whitelist
    whitelistKeys = [testKeyPair2.publicKey];
    originalReadPublicKeysFromFile = fileUtils.readPublicKeysFromFile;
    fileUtils.readPublicKeysFromFile = async () => whitelistKeys;
});

test('Apply function addWhitelist - happy path', async (t) => {
    const adminEntry = await admin.msb.state.get(EntryType.ADMIN);
    const assembledWhitelistMessages = await MsgUtils.assembleWhitelistMessages(adminEntry, admin.wallet);
    await admin.msb.state.append(assembledWhitelistMessages);
    const whitelist = await admin.msb.state.get(WHITELIST_PREFIX + testKeyPair2.publicKey);
    t.is(whitelist, true, 'Whitelist entry should be created and true');
});

hook('Cleanup after addWhitelist tests', async () => {
    if (admin && admin.msb) {
        await admin.msb.close();
    }
    if (tmpDirectory) {
        await removeTemporaryDirectory(tmpDirectory);
    }
    fileUtils.readPublicKeysFromFile = originalReadPublicKeysFromFile;
});