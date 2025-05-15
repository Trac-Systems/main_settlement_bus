import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { initAll, walletAdmin, writingKeyNonAdmin } from '../fixtures/assembleMessage.fixtures.js';
import { msgUtilsDefaultTest } from './msgUtilsDefaultTest.js';

const testName = 'assembleAddIndexerMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x, y) => {
        const ret = await MsgUtils.assembleAddIndexerMessage(x, y);
        return ret;
    }
    msgUtilsDefaultTest(t, testName, fn, walletAdmin, writingKeyNonAdmin, OperationType.ADD_INDEXER, 2, writingKeyNonAdmin);
});