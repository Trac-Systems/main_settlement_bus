import BaseOperationHandler from './base/BaseOperationHandler.js';
import CompleteStateMessageOperations from "../../../../messages/completeStateMessages/CompleteStateMessageOperations.js";
import { OperationType } from '../../../../utils/constants.js';
import {addressToBuffer} from "../../../state/utils/address.js";
import {normalizeHex} from "../../../../utils/helpers.js";
import PartialTransfer from "../validators/PartialTransfer.js";

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
        this.#partialTransferValidator = new PartialTransfer(this.state, this.wallet, this.network);
    }

    async handleOperation(payload) {
        if (payload.type !== OperationType.TRANSFER) {
            throw new Error('Unsupported operation type for TransferOperationHandler');
        }
        await this.#handleTransfer(payload);
    }

    async #handleTransfer(payload) {
        const normalizedPayload = this.#normalizeTransfer(payload);
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

    #normalizeTransfer(payload) {
        if (!payload || typeof payload !== 'object' || !payload.tro) {
            throw new Error('Invalid payload for transfer operation normalization.');
        }
        const {type, address, tro} = payload;
        if (
            type !== OperationType.TRANSFER ||
            !address ||
            !tro.tx || !tro.txv || !tro.in ||
            !tro.to || !tro.am || !tro.is
        ) {
            throw new Error('Missing required fields in transfer operation payload.');
        }

        const normalizedTro = {
            tx: normalizeHex(tro.tx),     // Transaction hash
            txv: normalizeHex(tro.txv),   // Transaction validity
            in: normalizeHex(tro.in),     // Nonce
            to: addressToBuffer(tro.to),   // Recipient address
            am: normalizeHex(tro.am),     // Amount
            is: normalizeHex(tro.is)      // Signature
        };

        return {
            type,
            address: addressToBuffer(address),
            tro: normalizedTro
        };
    }
}

export default TransferOperationHandler;
