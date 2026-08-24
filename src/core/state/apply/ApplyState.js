import b4a from 'b4a';
import ApplyRepository from './ApplyRepository.js';
import BalanceInitializationHandler from './operations/balanceInitializationOperation.js';
import DisableInitializationHandler from './operations/disableInitializationOperation.js';
import AddAdminHandler from './operations/addAdminOperation.js';
import AppendWhitelistHandler from './operations/appendWhitelistOperation.js';
import AddWriterHandler from './operations/addWriterOperation.js';
import RemoveWriterHandler from './operations/removeWriterOperation.js';
import AdminRecoveryHandler from './operations/adminRecoveryOperation.js';
import AddIndexerHandler from './operations/addIndexerOperation.js';
import RemoveIndexerHandler from './operations/removeIndexerOperation.js';
import BanValidatorHandler from './operations/banValidatorOperation.js';
import BootstrapDeploymentHandler from './operations/bootstrapDeploymentOperation.js';
import TxHandler from './operations/txOperation.js';
import TransferHandler from './operations/transferOperation.js';
import SetEpochHandler from './operations/setEpochOperation.js';
import SetGenesisEpochHandler from './operations/setGenesisEpochOperation.js';
import SetConsensusConfigHandler from './operations/setConsensusConfigOperation.js';
import {
    BATCH_SIZE,
} from '../../../utils/constants.js';
import {
    safeDecodeApplyOperation,
} from '../../../codecs/apply/applyOperationCodec.js';
import {
} from '../../../utils/buffer.js';
import transactionUtils from '../utils/transaction.js';
import {
} from '../utils/balance.js';
import { Status } from '../utils/transaction.js';
import {
} from '../../../codecs/consensus/v1/vdfConfigCodec.js';


const OVERSIZED_BATCH_PENALTY_MULTIPLIER = BATCH_SIZE;

class ApplyState {
    #config;
    #stateValidationSchema;
    #state;
    #repository;
    #handlers;

    constructor(config, stateValidationSchema, state) {
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
        this.#state = state;
        this.#repository = new ApplyRepository(this.#config, this.#state);
        this.#handlers = [
            new BalanceInitializationHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new DisableInitializationHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new AddAdminHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new AppendWhitelistHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new AddWriterHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new RemoveWriterHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new AdminRecoveryHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new AddIndexerHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new RemoveIndexerHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new BanValidatorHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new BootstrapDeploymentHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new TxHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new TransferHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new SetEpochHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new SetGenesisEpochHandler(this.#repository, this.#config, this.#stateValidationSchema),
            new SetConsensusConfigHandler(this.#repository, this.#config, this.#stateValidationSchema),
        ];    }

    async apply(nodes, view, base) {
        const batch = view.batch();
        const batchInvoker = nodes[0].from.key;


        if (nodes.length > BATCH_SIZE) {
            await this.#repository.validatorPenalty(batchInvoker, batch, base, OVERSIZED_BATCH_PENALTY_MULTIPLIER);
            await batch.flush();
            await batch.close();
            return;
        }

        let invalidOperations = 0;

        for (const node of nodes) {

            if (b4a.byteLength(node.value) > transactionUtils.MAXIMUM_OPERATION_PAYLOAD_SIZE) {
                this.#repository.safeLog("Node payload exceeds the maximum operation payload size.", node.from.key)
                invalidOperations++;
                continue;
            }

            const op = safeDecodeApplyOperation(node.value);

            if (!op) {
                this.#repository.safeLog("Failed to decode operation.", node.from.key)
                invalidOperations++;
                continue;
            }

            let operationHandled = false;
            for (const handler of this.#handlers) {
                if (handler.canHandle(op)) {
                    operationHandled = true;
                    const result = await handler.performOperation(op, view, base, node, batch);
                    if (result === Status.FAILURE) {
                        invalidOperations++;
                    } else if (result !== Status.SUCCESS && result !== Status.IGNORE) {
                        this.#repository.safeLog(`Unknown operation status: ${result}`, node.from.key);
                        invalidOperations++;
                    }
                    break;
                }
            }

            if (!operationHandled) {
                this.#repository.safeLog(`Unknown operation type: ${op.type}`, node.from.key)
                invalidOperations++;
            }
        }
        if (invalidOperations > 0) {
            await this.#repository.validatorPenalty(batchInvoker, batch, base, invalidOperations);
            this.#repository.safeLog(`Applied with ${invalidOperations} invalid operations.`)
        }

        await batch.flush();
        await batch.close();
    }












































}

export default ApplyState;
