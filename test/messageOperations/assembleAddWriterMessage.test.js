import test from 'brittle';
import MessageOperations from '../../src/utils/messages/MessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll } from '../fixtures/assembleMessage2.fixtures.js';
import { messageOperationsEkoTest } from './messageOperationsTest.js';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';

const testName = 'assembleAddWriterMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x, y) => {
        const ret = safeDecodeApplyOperation(await MessageOperations.assembleAddWriterMessage(x, y));
        return ret;
    }
    
    messageOperationsEkoTest(t, testName, fn, walletNonAdmin, writingKeyNonAdmin, OperationType.ADD_WRITER, 3, walletNonAdmin.publicKey);
});