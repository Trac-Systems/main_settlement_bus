import test from 'brittle';
import MessageOperations from '../../src/utils/messages/MessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll ,walletAdmin} from '../fixtures/assembleMessage2.fixtures.js';
import { messageOperationsBkoTest } from './messageOperationsTest.js';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';

const testName = 'assembleRemoveIndexerMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x, y) => {
        const ret = safeDecodeApplyOperation(await MessageOperations.assembleRemoveIndexerMessage(x, y));
        return ret;
    }
    messageOperationsBkoTest(t, testName, fn, walletNonAdmin, writingKeyNonAdmin, OperationType.REMOVE_INDEXER, 2, walletNonAdmin.publicKey);
});



