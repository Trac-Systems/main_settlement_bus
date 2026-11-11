import b4a from 'b4a';
import { BATCH_SIZE, OperationType } from '../../../utils/constants.js';
import { safeDecodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';
import transactionUtils, { Status } from '../utils/transaction.js';

const OVERSIZED_BATCH_PENALTY_MULTIPLIER = BATCH_SIZE;

export const withApplyDispatcher = Base => class extends Base {

    // ATTENTION: DO NOT USE METHODS ABOVE IN APPLY PART!
    ///////////////////////////////APPLY////////////////////////////////////

    async _apply(nodes, view, base) {
        const batch = view.batch();
        const batchInvoker = nodes[0].from.key;
        const postApplyEvents = [];


        if (nodes.length > BATCH_SIZE) {
            await this._validatorPenaltyApply(batchInvoker, batch, base, OVERSIZED_BATCH_PENALTY_MULTIPLIER);
            await batch.flush();
            await batch.close();
            return;
        }

        let invalidOperations = 0;

        for (const node of nodes) {

            if (b4a.byteLength(node.value) > transactionUtils.MAXIMUM_OPERATION_PAYLOAD_SIZE) {
                this._safeLogApply("Node payload exceeds the maximum operation payload size.", node.from.key)
                invalidOperations++;
                continue;
            }

            const op = safeDecodeApplyOperation(node.value);

            if (!op) {
                this._safeLogApply("Failed to decode operation.", node.from.key)
                invalidOperations++;
                continue;
            }

            const handler = this._getApplyOperationHandler(op.type);

            if (handler) {
                const result = await handler(op, view, base, node, batch, postApplyEvents);
                if (result === Status.FAILURE) {
                    invalidOperations++;
                } else if (result === Status.IGNORE) {
                    continue;
                } else if (result !== Status.SUCCESS) {
                    this._safeLogApply(`Unknown operation status: ${result}`, node.from.key);
                    invalidOperations++;
                }
            } else {
                this._safeLogApply(`Unknown operation type: ${op.type}`, node.from.key)
                invalidOperations++;
            }
        }
        if (invalidOperations > 0) {
            await this._validatorPenaltyApply(batchInvoker, batch, base, invalidOperations);
            this._safeLogApply(`Applied with ${invalidOperations} invalid operations.`)
        }

        await batch.flush();
        await batch.close();

        if (postApplyEvents.length !== 0) {
            try {
                this._stateEventQueue.enqueue(postApplyEvents, view.core.length);
            } catch (error) {
                this._safeLogApply('StateEventQueue', `Failed to queue post apply events: ${String(error)}`);
            }
        }
    }

    _getApplyOperationHandler(type) {
        const handlers = {
            [OperationType.BALANCE_INITIALIZATION]: this._handleApplyInitializeBalanceOperation.bind(this),
            [OperationType.DISABLE_INITIALIZATION]: this._handleApplyDisableBalanceInitializationOperation.bind(this),
            [OperationType.ADD_ADMIN]: this._handleApplyAddAdminOperation.bind(this),
            [OperationType.APPEND_WHITELIST]: this._handleApplyAppendWhitelistOperation.bind(this),
            [OperationType.ADD_WRITER]: this._handleApplyAddWriterOperation.bind(this),
            [OperationType.REMOVE_WRITER]: this._handleApplyRemoveWriterOperation.bind(this),
            [OperationType.ADMIN_RECOVERY]: this._handleApplyAdminRecoveryOperation.bind(this),
            [OperationType.ADD_INDEXER]: this._handleApplyAddIndexerOperation.bind(this),
            [OperationType.REMOVE_INDEXER]: this._handleApplyRemoveIndexerOperation.bind(this),
            [OperationType.BAN_VALIDATOR]: this._handleApplyBanValidatorOperation.bind(this),
            [OperationType.BOOTSTRAP_DEPLOYMENT]: this._handleApplyBootstrapDeploymentOperation.bind(this),
            [OperationType.TX]: this._handleApplyTxOperation.bind(this),
            [OperationType.TRANSFER]: this._handleApplyTransferOperation.bind(this),
            [OperationType.SET_EPOCH]: this._handleApplySetEpochOperation.bind(this),
            [OperationType.SET_GENESIS_EPOCH]: this._handleApplySetGenesisEpoch.bind(this),
            [OperationType.SET_CONSENSUS_CONFIG]: this._handleApplySetConsensusConfig.bind(this),
            [OperationType.HTLC_LOCK]: this._handleApplyHtlcLockOperation.bind(this),
            [OperationType.HTLC_CLAIM]: this._handleApplyHtlcClaimOperation.bind(this),
            [OperationType.HTLC_REFUND]: this._handleApplyHtlcRefundOperation.bind(this),
        };
        return handlers[type] || null;
    }
};
