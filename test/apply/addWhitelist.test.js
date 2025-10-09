import { test, hook } from 'brittle';
import b4a from 'b4a';
import { setupMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, randomBytes } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
import fileUtils from '../../src/utils/fileUtils.js';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import { address as addressApi } from 'trac-crypto-api';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

let admin, whitelistKeys, tmpDirectory, originalReadPublicKeysFromFile;
const address = addressApi.encode(TRAC_NETWORK_MSB_MAINNET_PREFIX, b4a.from(testKeyPair2.publicKey, 'hex'))
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
    const validity = b4a.from(await admin.msb.state.getIndexerSequenceState(), 'hex')
    const assembledWhitelistMessages = await CompleteStateMessageOperations.assembleAppendWhitelistMessages(admin.wallet, validity);
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