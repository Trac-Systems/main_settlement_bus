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
    OperationType,
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
        this.#handlers = {
            [OperationType.BALANCE_INITIALIZATION]: new BalanceInitializationHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.DISABLE_INITIALIZATION]: new DisableInitializationHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.ADD_ADMIN]: new AddAdminHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.APPEND_WHITELIST]: new AppendWhitelistHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.ADD_WRITER]: new AddWriterHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.REMOVE_WRITER]: new RemoveWriterHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.ADMIN_RECOVERY]: new AdminRecoveryHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.ADD_INDEXER]: new AddIndexerHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.REMOVE_INDEXER]: new RemoveIndexerHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.BAN_VALIDATOR]: new BanValidatorHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.BOOTSTRAP_DEPLOYMENT]: new BootstrapDeploymentHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.TX]: new TxHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.TRANSFER]: new TransferHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.SET_EPOCH]: new SetEpochHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.SET_GENESIS_EPOCH]: new SetGenesisEpochHandler(this.#repository, this.#config, this.#stateValidationSchema),
            [OperationType.SET_CONSENSUS_CONFIG]: new SetConsensusConfigHandler(this.#repository, this.#config, this.#stateValidationSchema),
        };
    }

    get config() {
        return this.#config;
    }

    get stateValidationSchema() {
        return this.#stateValidationSchema;
    }

    get state() {
        return this.#state;
    }

    get repository() {
        return this.#repository;
    }

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

            const handler = this.#getApplyOperationHandler(op.type);

            if (handler) {
                const result = await handler.performOperation(op, view, base, node, batch);
                if (result === Status.FAILURE) {
                    invalidOperations++;
                } else if (result === Status.IGNORE) {
                    continue;
                } else if (result !== Status.SUCCESS) {
                    this.#repository.safeLog(`Unknown operation status: ${result}`, node.from.key);
                    invalidOperations++;
                }
            } else {
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

    #getApplyOperationHandler(type) {
        return this.#handlers[type] || null;
    }

























    /**
     * Retrieves the address assigned to a given writing key from the registry.
     *
     * @param {Object} batch - The current Hyperbee batch instance used for reading state.
     * @param {string} writingKey - The writing key in hex string format.
     * @returns {Buffer|null} The address buffer assigned to the writing key, or null if not registered.
     */


















}

export default ApplyState;
