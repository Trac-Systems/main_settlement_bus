import BaseOperationHandler from './base/BaseOperationHandler.js';
import {OperationType} from '../../../../utils/constants.js';
import PartialTransfer from "../validators/PartialTransfer.js";
import {normalizeTransferOperation} from "../../../../utils/normalizers.js"
import {createApplyStateMessageFactory} from "../../../../messages/state/applyStateMessageFactory.js";
import {safeEncodeApplyOperation} from "../../../../utils/protobuf/operationHelpers.js";

class TransferOperationHandler extends BaseOperationHandler {
    #partialTransferValidator;
    #config;
    #wallet;

    /**
     * @param {Network} network
     * @param {State} state
     * @param {PeerWallet} wallet
     * @param {TransactionRateLimiterService} rateLimiter
     * @param {object} config
     **/
    constructor(network, state, wallet, rateLimiter, config) {
        super(network, state, wallet, rateLimiter, config);
        this.#config = config;
        this.#wallet = wallet;
        this.#partialTransferValidator = new PartialTransfer(state, this.#wallet.address, this.#config);
    }

    async handleOperation(payload) {
        if (payload.type !== OperationType.TRANSFER) {
            throw new Error('Unsupported operation type for TransferOperationHandler');
        }
        await this.#handleTransfer(payload);
    }

    async #handleTransfer(payload) {
        const normalizedPayload = normalizeTransferOperation(payload, this.#config);
        const isValid = await this.#partialTransferValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("TransferHandler: Transfer validation failed.");
        }

        const completeTransferOperation = await createApplyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteTransferOperationMessage(
                normalizedPayload.address,
                normalizedPayload.tro.tx,
                normalizedPayload.tro.txv,
                normalizedPayload.tro.in,
                normalizedPayload.tro.to,
                normalizedPayload.tro.am,
                normalizedPayload.tro.is
            )

        this.network.transactionPoolService.addTransaction(safeEncodeApplyOperation(completeTransferOperation));
    }
}

export default TransferOperationHandler;
