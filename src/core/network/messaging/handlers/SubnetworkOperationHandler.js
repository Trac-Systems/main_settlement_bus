import BaseOperationHandler from './base/BaseOperationHandler.js';
import CompleteStateMessageOperations from "../../../../messages/completeStateMessages/CompleteStateMessageOperations.js";
import {
    OperationType
} from '../../../../utils/constants.js';
import PartialBootstrapDeployment from "../validators/PartialBootstrapDeployment.js";
import {addressToBuffer} from "../../../state/utils/address.js";
import PartialTransaction from "../validators/PartialTransaction.js";
import {normalizeHex} from "../../../../utils/helpers.js";

/**
 * THIS CLASS IS ULTRA IMPORTANT BECAUSE IF SOMEONE WILL SEND A TRASH TO VALIDATOR AND IT WON'T BE HANDLED PROPERTLY -
 * FOR EXAMPLE VALIDATOR WILL BROADCAST IT TO THE INDEXER LAYER THEN IT WILL BE BANNED. SO EVERYTHING WHAT IS TRASH
 * MUST BE REFUSED.
 * TODO: WE SHOULD AUDIT VALIDATORS AND MAKE SURE THEY ARE NOT BROADCASTING TRASH TO THE INDEXER LAYER.
 */

class SubnetworkOperationHandler extends BaseOperationHandler {
    #partialBootstrapDeploymentValidator;
    #partialTransactionValidator;
    #config;
    #wallet;

    constructor(network, state, wallet, rateLimiter, config) {
        super(network, state, wallet, rateLimiter, config);
        this.#config = config
        this.#wallet = wallet
        this.#partialBootstrapDeploymentValidator = new PartialBootstrapDeployment(state, config);
        this.#partialTransactionValidator = new PartialTransaction(state, config);
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
        const normalizedPayload = this.#normalizeTransactionOperation(payload, this.#config);
        const isValid = await this.#partialTransactionValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("SubnetworkHandler: Transaction validation failed.");
        }

        const completeTransactionOperation = await new CompleteStateMessageOperations(this.#wallet, this.#config)
            .assembleCompleteTransactionOperationMessage(
                normalizedPayload.address,
                normalizedPayload.txo.tx,
                normalizedPayload.txo.txv,
                normalizedPayload.txo.iw,
                normalizedPayload.txo.in,
                normalizedPayload.txo.ch,
                normalizedPayload.txo.is,
                normalizedPayload.txo.bs,
                normalizedPayload.txo.mbs
            );
        this.network.transactionPoolService.addTransaction(completeTransactionOperation);
    }

    async #partialBootstrapDeploymentSubHandler(payload) {
        const normalizedPayload = this.#normalizeBootstrapDeployment(payload);
        const isValid = await this.#partialBootstrapDeploymentValidator.validate(normalizedPayload);
        if (!isValid) {
            throw new Error("SubnetworkHandler: Bootstrap deployment validation failed.");
        }

        const completeBootstrapDeploymentOperation = await new CompleteStateMessageOperations(this.#wallet, this.#config)
            .assembleCompleteBootstrapDeployment(
                normalizedPayload.address,
                normalizedPayload.bdo.tx,
                normalizedPayload.bdo.txv,
                normalizedPayload.bdo.bs,
                normalizedPayload.bdo.ic,
                normalizedPayload.bdo.in,
                normalizedPayload.bdo.is,
            )
        this.network.transactionPoolService.addTransaction(completeBootstrapDeploymentOperation);

    }

    #normalizeBootstrapDeployment(payload) {
        if (!payload || typeof payload !== 'object' || !payload.bdo) {
            throw new Error('Invalid payload for bootstrap deployment normalization.');
        }
        const {type, address, bdo} = payload;
        if (
            type !== OperationType.BOOTSTRAP_DEPLOYMENT ||
            !address ||
            !bdo.tx || !bdo.bs || !bdo.in || !bdo.is || !bdo.txv
        ) {
            throw new Error('Missing required fields in bootstrap deployment payload.');
        }

        const normalizedBdo = {
            tx: normalizeHex(bdo.tx),   // Transaction hash
            txv: normalizeHex(bdo.txv), // Transaction validity
            bs: normalizeHex(bdo.bs),   // External bootstrap
            ic: normalizeHex(bdo.ic),   // Channel
            in: normalizeHex(bdo.in),   // Nonce
            is: normalizeHex(bdo.is)    // Signature
        };

        return {
            type,
            address: addressToBuffer(address, this.#config.addressPrefix),
            bdo: normalizedBdo
        };
    }

    #normalizeTransactionOperation(payload) {
        if (!payload || typeof payload !== 'object' || !payload.txo) {
            throw new Error('Invalid payload for transaction operation normalization.');
        }
        const {type, address, txo} = payload;
        if (
            type !== OperationType.TX ||
            !address ||
            !txo.tx || !txo.txv || !txo.iw || !txo.in ||
            !txo.ch || !txo.is || !txo.bs || !txo.mbs
        ) {
            throw new Error('Missing required fields in transaction operation payload.');
        }

        const normalizedTxo = {
            tx: normalizeHex(txo.tx),    // Transaction hash
            txv: normalizeHex(txo.txv),  // Transaction validity
            iw: normalizeHex(txo.iw),    // Writing key
            in: normalizeHex(txo.in),    // Nonce
            ch: normalizeHex(txo.ch),    // Content hash
            is: normalizeHex(txo.is),    // Signature
            bs: normalizeHex(txo.bs),    // External bootstrap
            mbs: normalizeHex(txo.mbs)   // MSB bootstrap key
        };

        return {
            type,
            address: addressToBuffer(address, this.#config.addressPrefix),
            txo: normalizedTxo
        };
    }
}

export default SubnetworkOperationHandler;
