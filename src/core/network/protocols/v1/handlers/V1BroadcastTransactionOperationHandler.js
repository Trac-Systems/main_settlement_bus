import {networkMessageFactory} from "../../../../../messages/network/v1/networkMessageFactory.js";
import {NETWORK_CAPABILITIES, OperationType, ResultCode, TRANSACTION_POOL_SIZE} from "../../../../../utils/constants.js";
import {
    getResultCode,
    InvalidPayloadError,
    NodeHasNoWriteAccess,
    shouldEndConnection,
    UnexpectedError
} from "../V1ProtocolError.js";
import V1BroadcastTransactionRequest from "../validators/V1BroadcastTransactionRequest.js";
import {
    unsafeDecodeApplyOperation,
    unsafeEncodeApplyOperation
} from "../../../../../utils/protobuf/operationHelpers.js";
import {isBootstrapDeployment, isRoleAccess, isTransaction, isTransfer} from '../../../../../utils/applyOperations.js';
import PartialRoleAccessValidator from "../../shared/validators/PartialRoleAccessValidator.js";
import PartialBootstrapDeploymentValidator from "../../shared/validators/PartialBootstrapDeploymentValidator.js";
import PartialTransactionValidator from "../../shared/validators/PartialTransactionValidator.js";
import PartialTransferValidator from "../../shared/validators/PartialTransferValidator.js";
import {mapValidationErrorToV1Error} from "../V1ValidationErrorMapper.js";
import {applyStateMessageFactory} from "../../../../../messages/state/applyStateMessageFactory.js";
import V1BroadcastTransactionResponse from "../validators/V1BroadcastTransactionResponse.js";
import V1BaseOperationHandler from "./V1BaseOperationHandler.js";

class V1BroadcastTransactionOperationHandler extends V1BaseOperationHandler {
    #state;
    #wallet;
    #txPoolService;
    #broadcastTransactionRequestValidator;
    #broadcastTransactionResponseValidator;
    #partialRoleAccessValidator;
    #partialBootstrapDeploymentValidator;
    #partialTransactionValidator;
    #partialTransferValidator;

    constructor(state, wallet, rateLimiterService, txPoolService, pendingRequestService, config) {
        super(rateLimiterService, pendingRequestService, config);
        this.#state = state;
        this.#wallet = wallet;
        this.#txPoolService = txPoolService;
        this.#broadcastTransactionRequestValidator = new V1BroadcastTransactionRequest(config);
        this.#partialRoleAccessValidator = new PartialRoleAccessValidator(state, this.#wallet.address, config);
        this.#partialBootstrapDeploymentValidator = new PartialBootstrapDeploymentValidator(state, this.#wallet.address, config);
        this.#partialTransactionValidator = new PartialTransactionValidator(state, this.#wallet.address, config);
        this.#partialTransferValidator = new PartialTransferValidator(state, this.#wallet.address, config);
        this.#broadcastTransactionResponseValidator = new V1BroadcastTransactionResponse(config);
    }

    async handleRequest(message, connection) {
        let resultCode = ResultCode.OK;
        let endConnection = false;

        try {
            await this.#validationCapability();
            this.#isTxPoolFull();
            this.applyRateLimit(connection);

            await this.#broadcastTransactionRequestValidator.validate(message, connection.remotePublicKey);
            const decodedTransaction = this.decodeApplyOperation(message.broadcast_transaction_request.data);
            this.#sanitizeDecodedPartialTransaction(decodedTransaction);
            await this.dispatchTransaction(decodedTransaction);
        } catch (error) {
            const mappedError = mapValidationErrorToV1Error(error);
            resultCode = getResultCode(mappedError);
            endConnection = shouldEndConnection(mappedError);
            this.displayError(
                "failed to process broadcast transaction request from sender",
                connection.remotePublicKey,
                mappedError
            );
        }

        try {
            const response = await this.#buildBroadcastTransactionResponse(message.id, NETWORK_CAPABILITIES, resultCode);
            connection.protocolSession.sendAndForget(response);
            if (endConnection) connection.end();
        } catch (error) {
            this.displayError(
                "failed to build/send response to sender",
                connection.remotePublicKey,
                error
            );
            connection.end();
        }
    }

    async handleResponse(message, connection) {
        try {
            // TODO: In this case this should close connection of sender
            this.applyRateLimit(connection);

            await this.resolvePendingResponse(
                message,
                connection,
                this.#broadcastTransactionResponseValidator,
                this.#extractBroadcastResultCode
            );
        } catch (error) {
            // TODO: Question: how we should behave in this case? Consult this with Leo
            this.handlePendingResponseError(
                message.id,
                connection,
                error,
                "failed to process broadcast transaction response from sender"
            );
        }
    }

    async #buildBroadcastTransactionResponse(id, capabilities, resultCode) {
        try {
            return await networkMessageFactory(this.#wallet, this.config).buildBroadcastTransactionResponse(
                id,
                capabilities,
                resultCode
            );
        } catch (error) {
            throw new UnexpectedError(`Failed to build broadcast transaction response: ${error.message}`, true);
        }
    }

    decodeApplyOperation(message) {
        try {
            return unsafeDecodeApplyOperation(message);
        } catch (error) {
            throw new UnexpectedError(`Failed to decode apply operation from message: ${error.message}`, true);
        }
    }

    #sanitizeDecodedPartialTransaction(decodedTransaction) {
        // Protobuf decode sets optional completion fields as null, but partial validators expect those fields to be absent.
        // Otherwise, the presence of null fields causes validation to fail with "Expected type X but got null" errors.

        const type = decodedTransaction?.type;
        const operationKey = this.#getOperationPayloadKey(type);

        if (!operationKey || !decodedTransaction?.[operationKey] || typeof decodedTransaction[operationKey] !== 'object') {
            return;
        }

        for (const completionField of ['va', 'vn', 'vs']) {
            if (decodedTransaction[operationKey][completionField] === null) {
                delete decodedTransaction[operationKey][completionField];
            }
        }
    }

    #getOperationPayloadKey(type) {
        if (isRoleAccess(type)) return 'rao';
        if (isTransaction(type)) return 'txo';
        if (isBootstrapDeployment(type)) return 'bdo';
        if (isTransfer(type)) return 'tro';
        return null;
    }

    #isTxPoolFull() {
        // TODO: CREATE NEW ERROR THAT WILL describe that node is overloaded and it won't process transaction for now
        // In this case we should not return unexpected error.
        if (this.#txPoolService.tx_pool.length >= TRANSACTION_POOL_SIZE) {
            throw new UnexpectedError('Transaction pool is full, ignoring incoming transaction.', false);
        }
    }

    async #validationCapability() {
        const isAllowedToValidate = await this.#state.allowedToValidate(this.#wallet.address);
        const isAdminAllowedToValidate = await this.#state.isAdminAllowedToValidate();
        const canValidate = isAllowedToValidate || isAdminAllowedToValidate;
        if (!canValidate) {
            throw new NodeHasNoWriteAccess('State is not writable or is an indexer without admin privileges.');
        }
    }

    async dispatchTransaction(decodedTransaction) {
        if (!decodedTransaction || !Number.isInteger(decodedTransaction.type) || decodedTransaction.type === 0) {
            throw new InvalidPayloadError('Decoded transaction type is missing.', false);
        }
        const type = decodedTransaction.type;
        let completeTransactionOperation;

        if (isRoleAccess(type)) {
            await this.#partialRoleAccessValidator.validate(decodedTransaction);
            completeTransactionOperation = await this.#buildCompleteRoleAccessOperation(decodedTransaction);
        } else if (isTransaction(type)) {
            await this.#partialTransactionValidator.validate(decodedTransaction);
            completeTransactionOperation = await this.#buildCompleteTransactionOperation(decodedTransaction);
        } else if (isBootstrapDeployment(type)) {
            await this.#partialBootstrapDeploymentValidator.validate(decodedTransaction);
            completeTransactionOperation = await this.#buildCompleteBootstrapDeploymentOperation(decodedTransaction);
        } else if (isTransfer(type)) {
            await this.#partialTransferValidator.validate(decodedTransaction);
            completeTransactionOperation = await this.#buildCompleteTransferOperation(decodedTransaction);
        } else {
            throw new InvalidPayloadError(`Unsupported transaction type: ${type}`, false);
        }

        const encodedCompleteTransaction = unsafeEncodeApplyOperation(completeTransactionOperation);
        this.#txPoolService.addTransaction(encodedCompleteTransaction);
    }

    async #buildCompleteRoleAccessOperation(decodedTransaction) {
        const factory = applyStateMessageFactory(this.#wallet, this.config);

        switch (decodedTransaction.type) {
            case OperationType.ADD_WRITER:
                return factory.buildCompleteAddWriterMessage(
                    decodedTransaction.address,
                    decodedTransaction.rao.tx,
                    decodedTransaction.rao.txv,
                    decodedTransaction.rao.iw,
                    decodedTransaction.rao.in,
                    decodedTransaction.rao.is
                );
            case OperationType.REMOVE_WRITER:
                return factory.buildCompleteRemoveWriterMessage(
                    decodedTransaction.address,
                    decodedTransaction.rao.tx,
                    decodedTransaction.rao.txv,
                    decodedTransaction.rao.iw,
                    decodedTransaction.rao.in,
                    decodedTransaction.rao.is
                );
            case OperationType.ADMIN_RECOVERY:
                return factory.buildCompleteAdminRecoveryMessage(
                    decodedTransaction.address,
                    decodedTransaction.rao.tx,
                    decodedTransaction.rao.txv,
                    decodedTransaction.rao.iw,
                    decodedTransaction.rao.in,
                    decodedTransaction.rao.is
                );
            default:
                throw new InvalidPayloadError(`Unsupported role access transaction type: ${decodedTransaction.type}`, false);
        }
    }

    async #buildCompleteTransactionOperation(decodedTransaction) {
        return applyStateMessageFactory(this.#wallet, this.config)
            .buildCompleteTransactionOperationMessage(
                decodedTransaction.address,
                decodedTransaction.txo.tx,
                decodedTransaction.txo.txv,
                decodedTransaction.txo.iw,
                decodedTransaction.txo.in,
                decodedTransaction.txo.ch,
                decodedTransaction.txo.is,
                decodedTransaction.txo.bs,
                decodedTransaction.txo.mbs
            );
    }

    async #buildCompleteBootstrapDeploymentOperation(decodedTransaction) {
        return applyStateMessageFactory(this.#wallet, this.config)
            .buildCompleteBootstrapDeploymentMessage(
                decodedTransaction.address,
                decodedTransaction.bdo.tx,
                decodedTransaction.bdo.txv,
                decodedTransaction.bdo.bs,
                decodedTransaction.bdo.ic,
                decodedTransaction.bdo.in,
                decodedTransaction.bdo.is
            );
    }

    async #buildCompleteTransferOperation(decodedTransaction) {
        return applyStateMessageFactory(this.#wallet, this.config)
            .buildCompleteTransferOperationMessage(
                decodedTransaction.address,
                decodedTransaction.tro.tx,
                decodedTransaction.tro.txv,
                decodedTransaction.tro.in,
                decodedTransaction.tro.to,
                decodedTransaction.tro.am,
                decodedTransaction.tro.is
            );
    }

    #extractBroadcastResultCode(payload) {
        return payload.broadcast_transaction_response.result;
    }
}

export default V1BroadcastTransactionOperationHandler;
