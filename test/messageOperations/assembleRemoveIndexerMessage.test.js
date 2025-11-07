import test from 'brittle';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll ,walletAdmin} from '../fixtures/assembleMessage.fixtures.js';
import { messageOperationsBkoTest } from './commonsStateMessageOperationsTest.js';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';

const testName = 'assembleRemoveIndexerMessage';
test(testName, async (t) => {
    await initAll();
    const assembler = async (wallet,address) => {
        return safeDecodeApplyOperation(await CompleteStateMessageOperations.assembleRemoveIndexerMessage(wallet,address));
    }

    await messageOperationsBkoTest(t, testName, assembler, walletAdmin, writingKeyNonAdmin, OperationType.REMOVE_INDEXER, 2, walletNonAdmin.address);
});



