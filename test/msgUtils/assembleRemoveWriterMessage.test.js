import test from 'brittle';
import MsgUtils from '../../src/utils/msgUtils.js';
import { OperationType } from '../../src/utils/constants.js';
import { writingKeyNonAdmin, walletNonAdmin, initAll } from '../fixtures/assembleMessage.fixtures.js';
import { msgUtilsDefaultTest } from './msgUtilsDefaultTest.js';

const testName = 'assembleRemoveWriterMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x, y) => {
        const ret = await MsgUtils.assembleRemoveWriterMessage(x, y);
        return ret;
    }
    msgUtilsDefaultTest(t, testName, fn, walletNonAdmin, writingKeyNonAdmin, OperationType.REMOVE_WRITER, 4, walletNonAdmin.publicKey);
});