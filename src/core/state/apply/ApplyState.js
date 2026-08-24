import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import SafeLogger from './SafeLogger.js';
import ApplyOperations from './ApplyOperations.js';
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
    NULL_BUFFER,
} from '../../../utils/buffer.js';
import transactionUtils from '../utils/transaction.js';
import {
    BALANCE_FEE,
    toBalance,
    BALANCE_ZERO,
    toTerm,
} from '../utils/balance.js';
import addressUtils from '../utils/address.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeEntryUtils from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import {
    EntryType,
} from '../../../utils/constants.js';
import { Status } from '../utils/transaction.js';
import {
} from '../../../codecs/consensus/v1/vdfConfigCodec.js';


const OVERSIZED_BATCH_PENALTY_MULTIPLIER = BATCH_SIZE;

class ApplyState {
    #config;
    #stateValidationSchema;
    #state;
    #operations;
    #handlers;
    #logger;

    constructor(config, stateValidationSchema, state) {
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
        this.#state = state;
        this.#logger = new SafeLogger(this.#config);
        this.#operations = new ApplyOperations();
        this.#handlers = [
            new BalanceInitializationHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new DisableInitializationHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new AddAdminHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new AppendWhitelistHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new AddWriterHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new RemoveWriterHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new AdminRecoveryHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new AddIndexerHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new RemoveIndexerHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new BanValidatorHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new BootstrapDeploymentHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new TxHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new TransferHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new SetEpochHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new SetGenesisEpochHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
            new SetConsensusConfigHandler(this.#operations, this.#config, this.#stateValidationSchema, this.#state, this.#logger),
        ];
    }

    async apply(nodes, view, base) {
        const batch = view.batch();
        const batchInvoker = nodes[0].from.key;


        if (nodes.length > BATCH_SIZE) {
            await this.#validatorPenalty(batchInvoker, batch, base, OVERSIZED_BATCH_PENALTY_MULTIPLIER);
            await batch.flush();
            await batch.close();
            return;
        }

        let invalidOperations = 0;

        for (const node of nodes) {

            if (b4a.byteLength(node.value) > transactionUtils.MAXIMUM_OPERATION_PAYLOAD_SIZE) {
                this.#logger.error("Node payload exceeds the maximum operation payload size.", node.from.key)
                invalidOperations++;
                continue;
            }

            const op = safeDecodeApplyOperation(node.value);

            if (!op) {
                this.#logger.error("Failed to decode operation.", node.from.key)
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
                        this.#logger.error(`Unknown operation status: ${result}`, node.from.key);
                        invalidOperations++;
                    }
                    break;
                }
            }

            if (!operationHandled) {
                this.#logger.error(`Unknown operation type: ${op.type}`, node.from.key)
                invalidOperations++;
            }
        }
        if (invalidOperations > 0) {
            await this.#validatorPenalty(batchInvoker, batch, base, invalidOperations);
            this.#logger.error(`Applied with ${invalidOperations} invalid operations.`)
        }

        await batch.flush();
        await batch.close();
    }

    async #validatorPenalty(writingKeyBuffer, batch, base, invalidOperations) {
        const adminEntryBuffer = await this.#operations.getEntry(EntryType.ADMIN, batch);
        if (adminEntryBuffer === null) {
            this.#logger.error("ValidatorPenalty", "Admin entry not found", writingKeyBuffer);
            return;
        }
        const adminEntry = adminEntryUtils.decode(adminEntryBuffer, this.#config.addressPrefix);
        if (adminEntry === null) {
            this.#logger.error("ValidatorPenalty", "Failed to decode admin entry", writingKeyBuffer);
            return;
        }

        if (b4a.equals(adminEntry.wk, writingKeyBuffer)) {
            this.#logger.error("ValidatorPenalty", "Admin cannot be penalized", writingKeyBuffer);
            return;
        }

        // In theory, none of the negative cases in the if-statements should occur. They are added only for safety reasons.
        const validatorWk = writingKeyBuffer.toString('hex');

        const validatorAddressBuffer = await this.#operations.getRegisteredWriterKey(batch, validatorWk);
        if (validatorAddressBuffer === null) {
            this.#logger.error("ValidatorPenalty", `No validator found for writing key: ${validatorWk}`, writingKeyBuffer);
            return;
        }

        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.#logger.error("ValidatorPenalty", `Invalid validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.#logger.error("ValidatorPenalty", `Failed to decode validator public key: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorNodeEntryBuffer = await this.#operations.getEntry(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this.#logger.error("ValidatorPenalty", `No node entry found for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const decodedValidatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (decodedValidatorNodeEntry === null) {
            this.#logger.error("ValidatorPenalty", `Failed to decode validator node entry for address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const stakedBalance = toBalance(decodedValidatorNodeEntry.stakedBalance);

        if (stakedBalance === null) {
            this.#logger.error("ValidatorPenalty", `Invalid staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const penalty = BALANCE_FEE.mul(toTerm(BigInt(invalidOperations)));

        if (penalty === null) {
            this.#logger.error("ValidatorPenalty", `Failed to calculate penalty for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const deductedStakedBalance = penalty.greaterThanOrEquals(stakedBalance) ? BALANCE_ZERO : stakedBalance.sub(penalty);

        if (deductedStakedBalance === null) {
            this.#logger.error("ValidatorPenalty", `Failed to subtract penalty from staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        if (deductedStakedBalance.greaterThan(BALANCE_ZERO)) {
            const currentBalance = toBalance(decodedValidatorNodeEntry.balance);
            if (currentBalance === null) {
                this.#logger.error("ValidatorPenalty", `Invalid balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const newBalance = currentBalance.add(deductedStakedBalance);
            if (newBalance === null) {
                this.#logger.error("ValidatorPenalty", `Failed to add remaining staked balance to balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithBalance = newBalance.update(validatorNodeEntryBuffer);
            if (updatedNodeEntryWithBalance === null) {
                this.#logger.error("ValidatorPenalty", `Failed to update node entry with new balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
            if (updatedNodeEntryWithAllBalances === null) {
                this.#logger.error("ValidatorPenalty", `Failed to update node entry with new staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryWithAllBalances, nodeRoleUtils.NodeRole.WHITELISTED);
            if (downgradedNodeEntry === null) {
                this.#logger.error("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            await base.removeWriter(writingKeyBuffer);
            await batch.put(validatorAddressString, downgradedNodeEntry);
            return;
        }

        const updatedNodeEntryZeroStakedBalance = nodeEntryUtils.setStakedBalance(validatorNodeEntryBuffer, BALANCE_ZERO.value);
        if (updatedNodeEntryZeroStakedBalance === null) {
            this.#logger.error("ValidatorPenalty", `Failed to update node entry with new staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryZeroStakedBalance, nodeRoleUtils.NodeRole.WHITELISTED);
        if (downgradedNodeEntry === null) {
            this.#logger.error("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        await base.removeWriter(writingKeyBuffer);
        await batch.put(validatorAddressString, downgradedNodeEntry);
    }
}

export default ApplyState;
