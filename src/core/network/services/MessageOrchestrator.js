import { generateUUID, publicKeyToAddress } from '../../../utils/helpers.js';
import { operationToPayload } from '../../../utils/applyOperations.js';
import { networkMessageFactory } from "../../../messages/network/v1/networkMessageFactory.js";
import { NETWORK_CAPABILITIES, ResultCode } from "../../../utils/constants.js";
import {
    unsafeEncodeApplyOperation
} from "../../../utils/protobuf/operationHelpers.js";
import { normalizeMessageByOperationType } from "../../../utils/normalizers.js";
import { resultToValidatorAction, SENDER_ACTION } from "../protocols/connectionPolicies.js";
import { ConnectionManagerError } from './ConnectionManager.js';
import { getTelemetry } from '../../../utils/telemetry.js';

const RESULT_NAMES = new Map(Object.entries(ResultCode).map(([name, code]) => [code, name]));
/**
 * MessageOrchestrator coordinates message submission, retry, and validator management.
 * It works with ConnectionManager and ledger state to ensure reliable message delivery.
 */
class MessageOrchestrator {
    #config;
    #wallet;
    #telemetry;
    #idempotentSuccessCodes = new Set([
        ResultCode.TX_ALREADY_EXISTS,
        ResultCode.OPERATION_ALREADY_COMPLETED,
    ]);
    /**
     * Attempts to send a message to validators with retries and state checks.
     * @param {ConnectionManager} connectionManager - The connection manager instance
     * @param {object} state - The state to look for the message outcome
     * @param {Config} config - Configuration options:
     */
    constructor(connectionManager, state, config) {
        this.connectionManager = connectionManager;
        this.state = state;
        this.#config = config;
        this.#wallet = null;
        this.#telemetry = getTelemetry(config);
    }

    setWallet(wallet) {
        this.#wallet = wallet;
    }

    /**
     * Picks a validator for an outgoing message while avoiding requester self-validation.
     *
     * ValidatorObserverService already prevents connecting to the local node itself.
     * This method handles a different case: for a given message, we avoid selecting
     * a validator whose address equals `message.address` (requester), because
     * validator-side checks reject that flow.
     *
     * @param {object} [message] Outgoing operation payload.
     * @param {string} [message.address] Requester address (bech32m).
     * @returns {string|null} Selected validator public key hex, or null when unavailable.
     */
    #pickValidatorForMessage(message) {
        const requesterAddress = message?.address;
        if (!requesterAddress || typeof this.connectionManager.connectedValidators !== 'function') {
            return this.connectionManager.pickRandomConnectedValidator();
        }

        const connectedValidatorKeys = this.connectionManager.connectedValidators();
        if (!Array.isArray(connectedValidatorKeys) || connectedValidatorKeys.length === 0) {
            return null;
        }

        const eligibleValidatorKeys = connectedValidatorKeys.filter((publicKey) => {
            return publicKeyToAddress(publicKey, this.#config) !== requesterAddress;
        });

        let candidateValidatorKeys = connectedValidatorKeys;
        if (eligibleValidatorKeys.length > 0) {
            candidateValidatorKeys = eligibleValidatorKeys;
        }

        if (typeof this.connectionManager.pickRandomValidator === 'function') {
            return this.connectionManager.pickRandomValidator(candidateValidatorKeys);
        }

        const randomIndex = Math.floor(Math.random() * candidateValidatorKeys.length);
        return candidateValidatorKeys[randomIndex] ?? null;
    }

    /**
     * Sends a message to a single randomly selected connected validator.
     * @param {object} message - The message object to be sent
     * @param retries - The current retry count for this message
     * @returns {Promise<boolean>} - true if successful, false otherwise
     */
    async send(message, retries = 0) {
        const context = {
            broadcast_id: generateUUID(),
            tx_hash: this.#extractTxHash(message),
            operation_type: message?.type,
            attempts: 0,
            reason: 'unsupported_protocol',
        };
        const startedAt = Date.now();
        const fields = this.#broadcastFields(context);
        this.#telemetry.emit('tx.broadcast_started', fields);
        let success = false;
        try {
            success = await this.#send(message, retries, context);
            return success;
        } catch (error) {
            this.#sendFailed(context, context.lastFields ?? fields, 'exception', error);
            throw error;
        } finally {
            this.#telemetry.emit('tx.broadcast_finished', {
                ...fields,
                success,
                reason: context.reason,
                attempts: context.attempts,
                duration_ms: Date.now() - startedAt,
            }, success ? 6 : 4);
        }
    }

    #broadcastFields(context) {
        return {
            broadcast_id: context.broadcast_id,
            tx_hash: context.tx_hash,
            operation_type: context.operation_type,
        };
    }

    #sendFailed(context, fields, reason, error) {
        context.reason = reason;
        this.#telemetry.emit('tx.send_failed', {
            ...fields,
            reason,
            error_type: error instanceof Error ? error.name : undefined,
        }, 4);
    }

    #retry(message, retries, context, fields, reason) {
        this.#telemetry.emit('tx.retry', {
            ...fields,
            reason,
            retry_count: retries + 1,
            next_attempt_allowed: retries + 1 <= this.#config.maxRetries,
        }, 4);
        return this.#send(message, retries + 1, context);
    }

    async #send(message, retries, context) {
        if (retries > this.#config.maxRetries) {
            this.#sendFailed(context, this.#broadcastFields(context), 'max_retries');
            console.warn(`MessageOrchestrator: Max retries reached for transaction ${context.tx_hash ?? 'unknown'}. Aborting send.`);
            return false;
        }

        const validatorPublicKey = this.#pickValidatorForMessage(message);
        if (!validatorPublicKey) {
            this.#sendFailed(context, this.#broadcastFields(context), 'no_validators');
            return false;
        }

        console.log("Sending message to validator:", publicKeyToAddress(validatorPublicKey, this.#config));

        // Retain this connection throughout the attempt. The same public key can
        // refer to a replacement connection after any of the awaits below.
        const selectedConnection = this.connectionManager.getConnection(validatorPublicKey);
        const protocolSession = selectedConnection.protocolSession;
        const preferredProtocol = protocolSession.preferredProtocol;
        let requestId;
        if (preferredProtocol === protocolSession.supportedProtocols.V1) {
            requestId = generateUUID();
        }

        const fields = {
            ...this.#broadcastFields(context),
            validator_address: publicKeyToAddress(validatorPublicKey, this.#config),
            ...this.connectionManager.getConnectionDiagnostics?.(validatorPublicKey),
            pool_version: this.connectionManager.poolVersion,
            connected_validators: this.connectionManager.connectedValidators?.()?.length,
            protocol: preferredProtocol,
            request_id: requestId,
            attempt: context.attempts + 1,
            retry_count: retries,
        };
        context.lastFields = fields;
        this.#telemetry.emit('validator.selected', fields);

        if (preferredProtocol === protocolSession.supportedProtocols.LEGACY) {
            const startedAt = Date.now();
            let sendSucceeded = false;
            let failureReason = 'unsigned_timeout';
            try {
                sendSucceeded = await this.#sendLegacyMessageAndWaitForState(
                    message,
                    validatorPublicKey,
                    selectedConnection,
                    context,
                    fields
                );
                this.#telemetry.emit('tx.response', {
                    ...fields,
                    success: sendSucceeded,
                    response_source: 'local_unsigned_state',
                    duration_ms: Date.now() - startedAt,
                }, sendSucceeded ? 6 : 4);

                if (sendSucceeded) {
                    context.reason = 'unsigned_observed';
                } else {
                    this.#sendFailed(context, fields, failureReason);
                }
            } catch (error) {
                failureReason = 'send_error';
                this.#sendFailed(context, {
                    ...fields,
                    duration_ms: Date.now() - startedAt,
                }, failureReason, error);
                sendSucceeded = await this.#retry(message, retries, context, fields, failureReason);
            }

            // Legacy also reaches this branch if the recursive attempt in the
            // catch failed. It then removes the original connection and retries again.
            if (!sendSucceeded) {
                this.connectionManager.remove(validatorPublicKey, {
                    ...fields,
                    reason: failureReason,
                    expectedConnection: selectedConnection,
                });
                sendSucceeded = await this.#retry(message, retries, context, fields, failureReason);
            }

            return sendSucceeded;
        }

        if (preferredProtocol !== protocolSession.supportedProtocols.V1) {
            this.#sendFailed(context, fields, 'unsupported_protocol');
            return false;
        }

        // Construction errors propagate to the caller. Only sending and response
        // handling use the retry policy below.
        const normalizedMessage = normalizeMessageByOperationType(message, this.#config);
        const encodedTransaction = unsafeEncodeApplyOperation(normalizedMessage);
        const v1Message = await networkMessageFactory(this.#wallet, this.#config)
            .buildBroadcastTransactionRequest(
                requestId,
                encodedTransaction,
                NETWORK_CAPABILITIES
            );

        const startedAt = Date.now();
        try {
            const resultCode = await this.#sendOnSelectedConnection(
                v1Message,
                validatorPublicKey,
                selectedConnection,
                context,
                fields
            );
            const responseFields = {
                ...fields,
                result_code: resultCode,
                result_name: RESULT_NAMES.get(resultCode) ?? 'UNKNOWN',
                duration_ms: Date.now() - startedAt,
            };
            this.#telemetry.emit('tx.response', responseFields, resultCode === ResultCode.OK ? 6 : 4);

            const alreadyCommitted = await this.#isIdempotentSuccess(resultCode, message);
            if (alreadyCommitted) {
                context.reason = 'idempotent_success';
                this.#telemetry.emit('tx.idempotent_success', responseFields);
                return true;
            }

            const senderAction = resultToValidatorAction(resultCode);
            switch (senderAction) {
                case SENDER_ACTION.SUCCESS: {
                    context.reason = 'validator_accepted';
                    this.#recordSuccessfulSend(validatorPublicKey, selectedConnection, responseFields);
                    return true;
                }
                case SENDER_ACTION.ROTATE: {
                    this.#sendFailed(context, { ...responseFields, action: senderAction }, 'response_policy');
                    this.connectionManager.remove(validatorPublicKey, {
                        ...responseFields,
                        reason: 'response_policy',
                        expectedConnection: selectedConnection,
                    });
                    return false;
                }
                case SENDER_ACTION.NO_ROTATE: {
                    this.#sendFailed(context, { ...responseFields, action: senderAction }, 'response_policy');
                    return false;
                }
                default: {
                    this.#sendFailed(context, { ...responseFields, action: senderAction }, 'unknown_response_policy');
                    this.connectionManager.remove(validatorPublicKey, {
                        ...responseFields,
                        reason: 'response_policy',
                        expectedConnection: selectedConnection,
                    });
                    console.warn(
                        `MessageOrchestrator: Unrecognized action from connectionPolicies: ${senderAction}. ` +
                        `ResultCode was: ${resultCode}. Removing validator ${publicKeyToAddress(validatorPublicKey, this.#config)}`
                    );
                    return false;
                }
            }
        } catch (error) {
            let failureReason = 'send_error';
            if (error instanceof ConnectionManagerError) {
                failureReason = 'connection_unavailable';
            }
            this.#sendFailed(context, {
                ...fields,
                duration_ms: Date.now() - startedAt,
            }, failureReason, error);

            if (error instanceof ConnectionManagerError) {
                const retrySucceeded = await this.#retry(message, retries, context, fields, failureReason);
                console.warn(`MessageOrchestrator: Connection Error: ${error.message}`);
                return retrySucceeded;
            }

            this.connectionManager.remove(validatorPublicKey, {
                ...fields,
                reason: failureReason,
                expectedConnection: selectedConnection,
            });
            return await this.#retry(message, retries, context, fields, failureReason);
        }
    }

    /**
     * Determines whether a non-OK result code should be treated as a success due to idempotency.
     *
     * This handles the retry scenario where a requester did not receive or accept the response
     * from the first validator that committed the transaction. On retry, a second validator may
     * return TX_ALREADY_EXISTS or OPERATION_ALREADY_COMPLETED because the tx was already
     * processed. Those codes are not errors — they confirm the operation succeeded.
     *
     * To safely treat these as success, we check whether the local unsigned state for the tx
     * has been committed. This ensures we only acknowledge idempotent success when the state
     * change is actually observable locally, not just because the result code matched.
     */
    async #isIdempotentSuccess(resultCode, message) {
        if (!this.#idempotentSuccessCodes.has(resultCode)) {
            return false;
        }

        const txHash = this.#extractTxHash(message);
        if (!txHash) {
            return false;
        }

        // A short wait covers the race where a first validator committed the tx
        // and a retried validator only observes it as "already exists/completed".
        const timeout = this.#config.messageValidatorResponseTimeout ?? 2000;
        return await this.waitForUnsignedState(txHash, timeout);
    }

    async waitForUnsignedState(txHash, timeout) {
        return this.state.waitForUnsigned(txHash, timeout);
    }

    #extractTxHash(message) {
        if (!message || !Number.isInteger(message.type)) {
            return null;
        }

        const payloadKey = operationToPayload(message.type);
        const txHash = message?.[payloadKey]?.tx;
        if (typeof txHash !== 'string' || txHash.length === 0) {
            return null;
        }

        return txHash;
    }

    // TODO: Delete this function after legacy protocol is deprecated
    async #sendLegacyMessageAndWaitForState(message, validatorPublicKey, selectedConnection, context, fields) {
        const payloadKey = operationToPayload(message.type);
        await this.#sendOnSelectedConnection(message, validatorPublicKey, selectedConnection, context, fields);

        const transactionAppeared = await this.state.waitForUnsigned(
            message[payloadKey].tx,
            this.#config.messageValidatorResponseTimeout
        );
        if (!transactionAppeared) {
            return false;
        }

        this.#recordSuccessfulSend(validatorPublicKey, selectedConnection, fields);
        return true;
    }

    async #sendOnSelectedConnection(message, validatorPublicKey, selectedConnection, context, fields) {
        // Building a V1 request awaits hashing. The selected connection may have
        // been replaced by the time the request is ready to send.
        const currentConnection = this.connectionManager.getConnection(validatorPublicKey);
        if (currentConnection !== selectedConnection) {
            throw new ConnectionManagerError('Validator connection changed before sending the message.');
        }

        // Count attempts only when dispatch reaches the selected connection.
        // A replacement during request construction triggers a retry without a send.
        context.attempts++;
        this.#telemetry.emit('tx.send_started', fields);
        return this.connectionManager.sendSingleMessage(message, validatorPublicKey);
    }

    #recordSuccessfulSend(validatorPublicKey, selectedConnection, fields) {
        // A late response from an old socket belongs to that socket's counter,
        // not to a replacement connection registered under the same public key.
        const currentConnection = this.connectionManager.getConnection(validatorPublicKey);
        if (currentConnection !== selectedConnection) {
            return;
        }

        this.incrementSentCount(validatorPublicKey);
        if (this.shouldRemove(validatorPublicKey)) {
            this.connectionManager.remove(validatorPublicKey, {
                ...fields,
                reason: 'message_threshold',
                sent_count: this.connectionManager.getSentCount(validatorPublicKey),
                message_threshold: this.#config.messageThreshold,
                expectedConnection: selectedConnection,
            });
        }
    }

    incrementSentCount(validatorPublicKey) {
        this.connectionManager.incrementSentCount(validatorPublicKey);
    }

    shouldRemove(validatorPublicKey) {
        const sentCount = this.connectionManager.getSentCount(validatorPublicKey);
        return sentCount >= this.#config.messageThreshold;
    }
}

export default MessageOrchestrator;
