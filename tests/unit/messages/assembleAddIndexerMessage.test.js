import test from 'brittle';
import b4a from 'b4a';
import { createApplyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll ,walletAdmin} from '../fixtures/assembleMessage.fixtures.js';
import { messageOperationsBkoTest } from './commonsStateMessageOperationsTest.js';
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import { config } from '../../helpers/config.js';

const testName = 'assembleAddIndexerMessage';
test(testName, async (t) => {
    await initAll();
    const txValidity = b4a.alloc(32, 1);
    const assembler = async (wallet, address) => {
        const payload = await createApplyStateMessageFactory(wallet, config)
            .buildCompleteAddIndexerMessage(wallet.address, address, txValidity);
        return safeDecodeApplyOperation(safeEncodeApplyOperation(payload));
    }
    
    await messageOperationsBkoTest(t, testName, assembler, walletAdmin, writingKeyNonAdmin, OperationType.ADD_INDEXER, 5, walletNonAdmin.address);
    
});


