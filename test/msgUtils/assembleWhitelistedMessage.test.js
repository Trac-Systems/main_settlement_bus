import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { writingKeyAdmin, walletAdmin, initAll } from '../fixtures/assembleMessage.fixtures.js';
import { msgUtilsDefaultTest } from './msgUtilsDefaultTest.js';

const testName = 'assembleWhitelistedMessage';
test(testName, async (t) => {
    await initAll();

    const fn = async (x, y) => {
        const ret = await MsgUtils.assembleWhitelistedMessage(x, y);
        return ret;
    }
    msgUtilsDefaultTest(t, testName, fn, walletAdmin, writingKeyAdmin, OperationType.WHITELISTED, 2, writingKeyAdmin);
});