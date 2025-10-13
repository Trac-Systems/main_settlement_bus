import BaseOperationHandler from './base/BaseOperationHandler.js';
import CompleteStateMessageOperations from "../../../../messages/completeStateMessages/CompleteStateMessageOperations.js";
import { OperationType } from '../../../../utils/constants.js';
import PartialTransfer from "../validators/PartialTransfer.js";
import {normalizeTransferOperation} from "../../../../utils/normalizers.js"

/**
 * THIS CLASS IS ULTRA IMPORTANT BECAUSE IF SOMEONE WILL SEND A TRASH TO VALIDATOR AND IT WON'T BE HANDLED PROPERTLY -
 * FOR EXAMPLE VALIDATOR WILL BROADCAST IT TO THE INDEXER LAYER THEN IT WILL BE BANNED. SO EVERYTHING WHAT IS TRASH
 * MUST BE REFUSED.
 * TODO: WE SHOULD AUDIT VALIDATORS AND MAKE SURE THEY ARE NOT BROADCASTING TRASH TO THE INDEXER LAYER.
 */


class TransferOperationHandler extends BaseOperationHandler {
    #partialTransferValidator;

    constructor(network, state, wallet, rateLimiter, options = {}) {
        super(network, state, wallet, rateLimiter, options);
        this.#partialTransferValidator = new PartialTransfer(this.state);
    }

    async handleOperation(payload) {
        if (payload.type !== OperationType.TRANSFER) {
            throw new Error('Unsupported operation type for TransferOperationHandler');
        }
        await this.#handleTransfer(payload);
    }

    async #handleTransfer(payload) {
        const normalizedPayload = normalizeTransferOperation(payload);
        const isValid = await this.#partialTransferValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("TransferHandler: Transfer validation failed.");
        }

        const completeTransferOperation = await CompleteStateMessageOperations.assembleCompleteTransferOperationMessage(
            this.wallet,
            normalizedPayload.address,
            normalizedPayload.tro.tx,
            normalizedPayload.tro.txv,
            normalizedPayload.tro.in,
            normalizedPayload.tro.to,
            normalizedPayload.tro.am,
            normalizedPayload.tro.is
        );

        this.network.poolService.addTransaction(completeTransferOperation);
    }
}

export default TransferOperationHandler;
