import test from 'brittle';
import MessageOperations from '../../src/utils/messages/MessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll ,walletAdmin} from '../fixtures/assembleMessage2.fixtures.js';
import { messageOperationsBkoTest } from './messageOperationsTest.js';
import { safeDecodeAppyOperation } from '../../src/utils/functions.js';

const testName = 'assembleAddIndexerMessage';
test(testName, async (t) => {
    await initAll();
    const fn = async (x,y) => {
        const ret = safeDecodeAppyOperation(await MessageOperations.assembleAddIndexerMessage(x,y));
        return ret;
    }
    
    messageOperationsBkoTest(t, testName, fn, walletAdmin, writingKeyNonAdmin, OperationType.ADD_INDEXER, 2, walletNonAdmin.publicKey);
    
});




