import test from 'brittle';
import MessageOperations from '../../src/utils/messages/MessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll } from '../fixtures/assembleMessage2.fixtures.js';
import { messageOperationsEkoTest } from './messageOperationsTest.js';
import { safeDecodeAppyOperation } from '../../src/utils/functions.js';

const testName = 'assembleAddWriterMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x, y) => {
        const ret = safeDecodeAppyOperation(await MessageOperations.assembleAddWriterMessage(x, y));
        return ret;
    }
    
    messageOperationsEkoTest(t, testName, fn, walletNonAdmin, writingKeyNonAdmin, OperationType.ADD_WRITER, 3, walletNonAdmin.publicKey);
});