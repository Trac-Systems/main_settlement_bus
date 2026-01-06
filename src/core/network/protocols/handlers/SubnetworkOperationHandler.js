import BaseOperationHandler from './base/BaseOperationHandler.js';
import {
    OperationType
} from '../../../../utils/constants.js';
import PartialBootstrapDeployment from "../validators/PartialBootstrapDeployment.js";
import PartialTransaction from "../validators/PartialTransaction.js";
import {applyStateMessageFactory} from "../../../../messages/state/applyStateMessageFactory.js";
import {safeEncodeApplyOperation} from "../../../../utils/protobuf/operationHelpers.js";
import {
    normalizeBootstrapDeploymentOperation,
    normalizeTransactionOperation
} from "../../../../utils/normalizers.js";


class SubnetworkOperationHandler extends BaseOperationHandler {
    #partialBootstrapDeploymentValidator;
    #partialTransactionValidator;
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
        this.#config = config
        this.#wallet = wallet
        this.#partialBootstrapDeploymentValidator = new PartialBootstrapDeployment(state, this.#wallet.address, config);
        this.#partialTransactionValidator = new PartialTransaction(state, this.#wallet.address, config);
    }

    async handleOperation(payload) {
        if (payload.type === OperationType.TX) {
            await this.#partialTransactionSubHandler(payload);
        } else if (payload.type === OperationType.BOOTSTRAP_DEPLOYMENT) {
            await this.#partialBootstrapDeploymentSubHandler(payload);
        } else {
            throw new Error('Unsupported operation type for SubnetworkOperationHandler');
        }
    }

    async #partialTransactionSubHandler(payload) {
        const normalizedPayload = normalizeTransactionOperation(payload, this.#config);
        const isValid = await this.#partialTransactionValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("SubnetworkHandler: Transaction validation failed.");
        }

        const completeTransactionOperation = await applyStateMessageFactory(this.#wallet,this.#config)
            .buildCompleteTransactionOperationMessage(
                normalizedPayload.address,
                normalizedPayload.txo.tx,
                normalizedPayload.txo.txv,
                normalizedPayload.txo.iw,
                normalizedPayload.txo.in,
                normalizedPayload.txo.ch,
                normalizedPayload.txo.is,
                normalizedPayload.txo.bs,
                normalizedPayload.txo.mbs
            )
        this.network.transactionPoolService.addTransaction(safeEncodeApplyOperation(completeTransactionOperation));
    }

    async #partialBootstrapDeploymentSubHandler(payload) {
        const normalizedPayload = normalizeBootstrapDeploymentOperation(payload, this.#config);
        const isValid = await this.#partialBootstrapDeploymentValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("SubnetworkHandler: Bootstrap deployment validation failed.");
        }


        const completeBootstrapDeploymentOperation = await applyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteBootstrapDeploymentMessage(
                normalizedPayload.address,
                normalizedPayload.bdo.tx,
                normalizedPayload.bdo.txv,
                normalizedPayload.bdo.bs,
                normalizedPayload.bdo.ic,
                normalizedPayload.bdo.in,
                normalizedPayload.bdo.is
            )
        this.network.transactionPoolService.addTransaction(safeEncodeApplyOperation(completeBootstrapDeploymentOperation));

    }
}

export default SubnetworkOperationHandler;
