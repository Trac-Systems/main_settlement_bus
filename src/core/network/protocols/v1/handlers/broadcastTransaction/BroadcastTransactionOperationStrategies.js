import {OperationType, ResultCode} from "../../../../../../utils/constants.js";
import {V1ProtocolError} from "../../V1ProtocolError.js";

function createOperationStrategy(payloadKey, validator, buildCompleteOperation) {
    return {
        payloadKey,
        async build(decodedTransaction) {
            await validator.validate(decodedTransaction);
            return buildCompleteOperation(decodedTransaction);
        }
    };
}

export function createBroadcastTransactionOperationStrategies({
    partialRoleAccessValidator,
    partialBootstrapDeploymentValidator,
    partialTransactionValidator,
    partialTransferValidator,
    partialHtlcValidator,
    createApplyStateMessageFactory
}) {
    return new Map([
        [
            OperationType.ADD_WRITER,
            createOperationStrategy(
                'rao',
                partialRoleAccessValidator,
                decodedTransaction => createApplyStateMessageFactory().buildCompleteAddWriterMessage(
                    decodedTransaction.address,
                    decodedTransaction.rao.tx,
                    decodedTransaction.rao.txv,
                    decodedTransaction.rao.iw,
                    decodedTransaction.rao.in,
                    decodedTransaction.rao.is
                )
            )
        ],
        [
            OperationType.REMOVE_WRITER,
            createOperationStrategy(
                'rao',
                partialRoleAccessValidator,
                decodedTransaction => createApplyStateMessageFactory().buildCompleteRemoveWriterMessage(
                    decodedTransaction.address,
                    decodedTransaction.rao.tx,
                    decodedTransaction.rao.txv,
                    decodedTransaction.rao.iw,
                    decodedTransaction.rao.in,
                    decodedTransaction.rao.is
                )
            )
        ],
        [
            OperationType.ADMIN_RECOVERY,
            createOperationStrategy(
                'rao',
                partialRoleAccessValidator,
                decodedTransaction => createApplyStateMessageFactory().buildCompleteAdminRecoveryMessage(
                    decodedTransaction.address,
                    decodedTransaction.rao.tx,
                    decodedTransaction.rao.txv,
                    decodedTransaction.rao.iw,
                    decodedTransaction.rao.in,
                    decodedTransaction.rao.is
                )
            )
        ],
        [
            OperationType.TX,
            createOperationStrategy(
                'txo',
                partialTransactionValidator,
                decodedTransaction => createApplyStateMessageFactory().buildCompleteTransactionOperationMessage(
                    decodedTransaction.address,
                    decodedTransaction.txo.tx,
                    decodedTransaction.txo.txv,
                    decodedTransaction.txo.iw,
                    decodedTransaction.txo.in,
                    decodedTransaction.txo.ch,
                    decodedTransaction.txo.is,
                    decodedTransaction.txo.bs,
                    decodedTransaction.txo.mbs
                )
            )
        ],
        [
            OperationType.BOOTSTRAP_DEPLOYMENT,
            createOperationStrategy(
                'bdo',
                partialBootstrapDeploymentValidator,
                decodedTransaction => createApplyStateMessageFactory().buildCompleteBootstrapDeploymentMessage(
                    decodedTransaction.address,
                    decodedTransaction.bdo.tx,
                    decodedTransaction.bdo.txv,
                    decodedTransaction.bdo.bs,
                    decodedTransaction.bdo.ic,
                    decodedTransaction.bdo.in,
                    decodedTransaction.bdo.is
                )
            )
        ],
        [
            OperationType.TRANSFER,
            createOperationStrategy(
                'tro',
                partialTransferValidator,
                decodedTransaction => createApplyStateMessageFactory().buildCompleteTransferOperationMessage(
                    decodedTransaction.address,
                    decodedTransaction.tro.tx,
                    decodedTransaction.tro.txv,
                    decodedTransaction.tro.in,
                    decodedTransaction.tro.to,
                    decodedTransaction.tro.am,
                    decodedTransaction.tro.is
                )
            )
        ],
        [
            OperationType.HTLC_LOCK,
            createOperationStrategy(
                'hlo',
                partialHtlcValidator,
                decodedOperation => createApplyStateMessageFactory().buildCompleteHtlcLockOperationMessage(
                    decodedOperation.address
                )
            )
        ],
        [
            OperationType.HTLC_CLAIM,
            createOperationStrategy(
                'hco',
                partialHtlcValidator,
                decodedOperation => createApplyStateMessageFactory().buildCompleteHtlcClaimOperationMessage(
                    decodedOperation.address,
                    decodedOperation.hco.tx,
                    decodedOperation.hco.txv,
                    decodedOperation.hco.li,
                    decodedOperation.hco.pi,
                    decodedOperation.hco.in,
                    decodedOperation.hco.is
                )
            )
        ],
        [
            OperationType.HTLC_REFUND,
            createOperationStrategy(
                'hro',
                partialHtlcValidator,
                decodedOperation => createApplyStateMessageFactory().buildCompleteHtlcRefundOperationMessage(
                    decodedOperation.address
                )
            )
        ]
    ]);
}

export function resolveBroadcastTransactionOperationStrategy(type, operationStrategies) {
    const operationStrategy = operationStrategies.get(type);

    if (!operationStrategy) {
        throw new V1ProtocolError(ResultCode.TX_INVALID_PAYLOAD, `Unsupported transaction type: ${type}`);
    }

    return operationStrategy;
}
