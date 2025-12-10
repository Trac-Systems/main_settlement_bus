import test from 'brittle';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import {OperationType} from '../../src/utils/protobuf/applyOperations.cjs';
import {initAll, walletNonAdmin, writingKeyNonAdmin} from '../fixtures/assembleMessage.fixtures.js';
import {messageOperationsEkoTest} from './commonsStateMessageOperationsTest.js';
import {safeDecodeApplyOperation} from '../../src/utils/protobuf/operationHelpers.js';
import { config } from '../../helpers/config.js'

const testName = 'assembleAddWriterMessage';
test(testName, async (t) => {
    await initAll();
    const assembler = async (wallet, writingKey) => {
        return safeDecodeApplyOperation(await new CompleteStateMessageOperations(wallet, config).assembleAddWriterMessage(writingKey));
    }
    
    await messageOperationsEkoTest(t, testName, assembler, walletNonAdmin, writingKeyNonAdmin, OperationType.ADD_WRITER, 3, walletNonAdmin.address);
});