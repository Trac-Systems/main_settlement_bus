import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { initAll, walletNonAdmin, writingKeyNonAdmin } from '../fixtures/assembleMessage.fixtures.js';
import { msgUtilsDefaultTest } from './msgUtilsDefaultTest.js';

const testName = 'assembleRemoveIndexerMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x, y) => {
        const ret = await MsgUtils.assembleRemoveIndexerMessage(x, y);
        return ret;
    }
    msgUtilsDefaultTest(t, testName, fn, walletNonAdmin, writingKeyNonAdmin, OperationType.REMOVE_INDEXER, 2, writingKeyNonAdmin);
});