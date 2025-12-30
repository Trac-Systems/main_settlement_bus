import test from 'brittle';
import b4a from 'b4a';
import { createApplyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs';
import { initAll, walletNonAdmin, writingKeyNonAdmin } from '../fixtures/assembleMessage.fixtures.js';
import { messageOperationsEkoTest } from './commonsStateMessageOperationsTest.js';
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import { config } from '../../helpers/config.js';

const testName = 'assembleRemoveWriterMessage';
test(testName, async (t) => {
    await initAll();
    const txHash = b4a.alloc(32, 1);
    const txValidity = b4a.alloc(32, 2);
    const incomingNonce = b4a.alloc(32, 3);
    const incomingSignature = b4a.alloc(64, 4);
    const assembler = async (wallet, writingKey) => {
        const payload = await createApplyStateMessageFactory(wallet, config)
            .buildCompleteRemoveWriterMessage(
                wallet.address,
                txHash,
                txValidity,
                writingKey,
                incomingNonce,
                incomingSignature
            );
        return safeDecodeApplyOperation(safeEncodeApplyOperation(payload));
    }
    await messageOperationsEkoTest(t, testName, assembler, walletNonAdmin, writingKeyNonAdmin, OperationType.REMOVE_WRITER, 8, walletNonAdmin.address);
});
