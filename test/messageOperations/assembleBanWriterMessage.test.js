import test from 'brittle';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { writingKeyNonAdmin, walletNonAdmin, initAll, walletAdmin } from '../fixtures/assembleMessage2.fixtures.js';
import { messageOperationsBkoTest } from './messageOperationsTest.js';
import { safeDecodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';

const testName = 'assembleBanWriterMessage';
test(testName, async (t) => {
    await initAll();
    const assembler = async (wallet,address) => {
        return safeDecodeApplyOperation(await StateMessageOperations.assembleBanWriterMessage(wallet,address));
    }
    await messageOperationsBkoTest(t, testName, assembler, walletAdmin, writingKeyNonAdmin, OperationType.BAN_WRITER, 2, walletNonAdmin.address);
    
});