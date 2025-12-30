import { test, hook } from '../../helpers/wrapper.js';
import b4a from 'b4a';
import { setupMsbAdmin, initTemporaryDirectory, removeTemporaryDirectory, randomBytes } from '../../helpers/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';
import fileUtils from '../../../src/utils/fileUtils.js';
import { createApplyStateMessageFactory } from '../../../src/messages/state/applyStateMessageFactory.js';
import { safeEncodeApplyOperation } from '../../../src/utils/protobuf/operationHelpers.js';
import { address as addressApi } from 'trac-crypto-api';
import { config } from '../../helpers/config.js';

let admin, whitelistKeys, tmpDirectory, originalReadAddressesFromWhitelistFile;
const address = addressApi.encode(config.addressPrefix, b4a.from(testKeyPair2.publicKey, 'hex'))
hook('Initialize admin node for addWhitelist tests', async () => {
    const randomChannel = randomBytes(32).toString('hex');
    const baseOptions = {
        enable_txchannels: false,
        enableTxApplyLogs: false,
        enableInteractiveMode: false,
        enableRoleRequester: false,
        channel: randomChannel,
    }
    tmpDirectory = await initTemporaryDirectory();

    // Configure admin
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, baseOptions);
    await admin.msb.ready();

    // Configure whitelist
    whitelistKeys = [address];
    originalReadAddressesFromWhitelistFile = fileUtils.readAddressesFromWhitelistFile;
    fileUtils.readAddressesFromWhitelistFile = async () => whitelistKeys;
});

test('Apply function addWhitelist - happy path', async (t) => {
    const validity = await admin.msb.state.getIndexerSequenceState();
    const payload = safeEncodeApplyOperation(
        await createApplyStateMessageFactory(admin.wallet, config)
            .buildCompleteAppendWhitelistMessage(admin.wallet.address, address, validity)
    );

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
    fileUtils.readAddressesFromWhitelistFile = originalReadAddressesFromWhitelistFile;
});
