import b4a from 'b4a';
import nodeEntryUtils, { NODE_ENTRY_SIZE } from '../../../utils/nodeEntry.js';
import {
    BALANCE_ZERO,
    toBalance,
} from '../../../utils/balance.js';

class BaseHandler {
    #state;

    constructor(logger, state) {
        this.logger = logger;
        this.#state = state;
    }

    emitEvent(event, ...args) {
        try {
            this.#state.emit(event, ...args)
        } catch (_ignored) { }
    }

    async isValidatorValid(validatorEntryBuffer, node, op) {
        // TODO: Maybe we should transfer all validator checks to this function (address, pubKey, signature, etc)
        if (validatorEntryBuffer === null) {
            this.logger.error(op.type, "Incoming validator entry is null.", node.from.key)
            return false;
        };

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (decodedValidatorEntry === null) {
            this.logger.error(op.type, "Failed to decode validator entry.", node.from.key)
            return false;
        };

        // validator must be active writer
        if (!decodedValidatorEntry.isWriter) {
            this.logger.error(op.type, "Operation validator is not active", node.from.key)
            return false;
        };

        // The autobase payload should be appended by the node that signed the partial operation.
        const validatorWk = decodedValidatorEntry.wk;
        if (!b4a.equals(validatorWk, node.from.key)) {
            this.logger.error(op.type, "Validator cannot be the same as requester.", node.from.key)
            return false;
        }
        return true;
    }

    withdrawStakedBalance(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this.logger.error("withdrawStakedBalanceApply", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this.logger.error("withdrawStakedBalanceApply", "Failed to decode node entry", node.from.key);
            return null;
        }

        const stakedBalance = toBalance(decodedNodeEntry.stakedBalance);
        if (stakedBalance === null) {
            this.logger.error("withdrawStakedBalanceApply", "Invalid staked balance", node.from.key);
            return null;
        }

        if (!stakedBalance.greaterThan(BALANCE_ZERO)) {
            this.logger.error("withdrawStakedBalanceApply", "No staked balance to unstake", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this.logger.error("withdrawStakedBalanceApply", "Invalid current balance", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.add(stakedBalance);
        if (newNodeBalance === null) {
            this.logger.error("withdrawStakedBalanceApply", "Failed to add staked balance to current balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this.logger.error("withdrawStakedBalanceApply", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this.logger.error("withdrawStakedBalanceApply", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;
    }
}

export default BaseHandler;
