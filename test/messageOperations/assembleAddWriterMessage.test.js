import test from 'brittle';
import StateMessageOperations from '../../src/messages/stateMessages/StateMessageOperations.js';
import {OperationType} from '../../src/utils/protobuf/applyOperations.cjs';
import {initAll, walletNonAdmin, writingKeyNonAdmin} from '../fixtures/assembleMessage2.fixtures.js';
import {messageOperationsEkoTest} from './messageOperationsTest.js';
import {safeDecodeApplyOperation} from '../../src/utils/protobuf/operationHelpers.js';

const testName = 'assembleAddWriterMessage';
test(testName, async (t) => {
    await initAll();
    const assembler = async (wallet, writingKey) => {
        return safeDecodeApplyOperation(await StateMessageOperations.assembleAddWriterMessage(wallet, writingKey));
    }
    
    await messageOperationsEkoTest(t, testName, assembler, walletNonAdmin, writingKeyNonAdmin, OperationType.ADD_WRITER, 3, walletNonAdmin.address);
});