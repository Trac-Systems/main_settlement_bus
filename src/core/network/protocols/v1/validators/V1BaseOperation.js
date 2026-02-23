import V1ValidationSchema from "./V1ValidationSchema.js";
import {NetworkOperationType, ResultCode} from "../../../../../utils/constants.js";
import PeerWallet from "trac-wallet";
import b4a from "b4a";
import {
    createMessage,
    encodeCapabilities,
    idToBuffer,
    safeWriteUInt32BE,
    timestampToBuffer
} from "../../../../../utils/buffer.js";
import {
    V1InvalidPayloadError,
    V1SignatureInvalidError,
    V1UnexpectedError,
} from "../V1ProtocolError.js";

class V1BaseOperation {
    #v1ValidationSchema
    #config

    constructor(config) {
        this.#config = config;
        this.#v1ValidationSchema = new V1ValidationSchema();
    }

    async validate(payload, connection, pendingRequestServiceEntry) {
        throw new Error("Method 'validate()' must be implemented.");
    }

    isPayloadSchemaValid(payload) {
        if (!payload || payload.type === null || payload.type === undefined) {
            throw new V1InvalidPayloadError('Payload or payload type is missing.');
        }

        const selectedValidator = this.#selectCheckSchemaValidator(payload.type);
        const isPayloadValid = selectedValidator(payload);
        if (!isPayloadValid) {
            throw new V1InvalidPayloadError('Payload is invalid.');
        }
    }

    async validateSignature(payload, remotePublicKey) {
        let signature;
        let message;
        try {
            const result = this.#buildSignatureMessage(payload);
            signature = result.signature;
            message = result.message;
        } catch (error) {
            if (error && typeof error === 'object' && 'resultCode' in error) {
                throw error;
            }
            throw new V1InvalidPayloadError(`Failed to build signature message: ${error.message}`);
        }

        let hash;
        try {
            hash = await PeerWallet.blake3(message);
        } catch (error) {
            throw new V1InvalidPayloadError('Failed to hash signature message.');
        }

        let verified = false;
        try {
            verified = PeerWallet.verify(signature, hash, remotePublicKey);
        } catch (error) {
            verified = false;
        }
        if (!verified) {
            throw new V1SignatureInvalidError('signature verification failed.');
        }
    }

    #buildSignatureMessage(payload) {
        if (!Number.isInteger(payload.type)) {
            throw new V1InvalidPayloadError('Operation type must be an integer.');
        }
        if (payload.type === 0) {
            throw new V1InvalidPayloadError('Operation type is unspecified.');
        }

        const idBuf = idToBuffer(payload.id);
        const tsBuf = timestampToBuffer(payload.timestamp);
        const capsBuf = encodeCapabilities(payload.capabilities ?? []);

        switch (payload.type) {
            case NetworkOperationType.LIVENESS_REQUEST: {
                const nonce = payload.liveness_request.nonce;
                const signature = payload.liveness_request.signature;
                const message = createMessage(payload.type, idBuf, tsBuf, nonce, capsBuf);
                return {signature, message};
            }
            case NetworkOperationType.LIVENESS_RESPONSE: {
                const nonce = payload.liveness_response.nonce;
                const signature = payload.liveness_response.signature;
                const result = payload.liveness_response.result;
                const message = createMessage(payload.type, idBuf, tsBuf, nonce, safeWriteUInt32BE(result, 0), capsBuf);
                return {signature, message};
            }
            case NetworkOperationType.BROADCAST_TRANSACTION_REQUEST: {
                const data = payload.broadcast_transaction_request.data;
                const nonce = payload.broadcast_transaction_request.nonce;
                const signature = payload.broadcast_transaction_request.signature;
                const message = createMessage(payload.type, idBuf, tsBuf, data, nonce, capsBuf);
                return {signature, message};
            }
            case NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE: {
                const nonce = payload.broadcast_transaction_response.nonce;
                const signature = payload.broadcast_transaction_response.signature;
                const result = payload.broadcast_transaction_response.result;
                const proofRaw = payload.broadcast_transaction_response.proof;
                const proof = b4a.isBuffer(proofRaw) ? proofRaw : b4a.alloc(0);
                const hasProof = proof.length > 0;
                const appendedAtRaw = payload.broadcast_transaction_response.appendedAt;
                const appendedAt = Number.isSafeInteger(appendedAtRaw) ? appendedAtRaw : 0;
                const hasAppendedAt = appendedAt > 0;

                if (result === ResultCode.OK) {
                    if (!hasProof || !hasAppendedAt) {
                        throw new V1InvalidPayloadError('Result code OK requires non-empty proof and appendedAt > 0.');
                    }
                } else if (result === ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE) {
                    if (hasProof) {
                        throw new V1InvalidPayloadError('Result code TX_ACCEPTED_PROOF_UNAVAILABLE requires empty proof.');
                    }
                    if (!hasAppendedAt) {
                        throw new V1InvalidPayloadError('Result code TX_ACCEPTED_PROOF_UNAVAILABLE requires appendedAt > 0.');
                    }
                } else {
                    if (hasProof) {
                        throw new V1InvalidPayloadError('Non-OK result code requires empty proof.');
                    }
                    if (appendedAt !== 0) {
                        throw new V1InvalidPayloadError('Non-OK result code requires appendedAt to be 0, except TX_ACCEPTED_PROOF_UNAVAILABLE.');
                    }
                }

                const message = createMessage(
                    payload.type,
                    idBuf,
                    tsBuf,
                    nonce,
                    proof,
                    timestampToBuffer(appendedAt),
                    safeWriteUInt32BE(result, 0),
                    capsBuf
                );

                return {signature, message};
            }
            default:
                throw new V1UnexpectedError(`Unknown operation type: ${payload.type}`);
        }
    }

    #selectCheckSchemaValidator(type) {
        if (!Number.isInteger(type)) {
            throw new V1InvalidPayloadError('Operation type must be an integer.');
        }
        if (type === 0) {
            throw new V1InvalidPayloadError('Operation type is unspecified.');
        }

        switch (type) {
            case NetworkOperationType.LIVENESS_REQUEST:
                return this.#v1ValidationSchema.validateV1LivenessRequest.bind(this.#v1ValidationSchema);
            case NetworkOperationType.LIVENESS_RESPONSE:
                return this.#v1ValidationSchema.validateV1LivenessResponse.bind(this.#v1ValidationSchema);
            case NetworkOperationType.BROADCAST_TRANSACTION_REQUEST:
                return this.#v1ValidationSchema.validateV1BroadcastTransactionRequest.bind(this.#v1ValidationSchema);
            case NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE:
                return this.#v1ValidationSchema.validateV1BroadcastTransactionResponse.bind(this.#v1ValidationSchema);
            default:
                throw new V1UnexpectedError(`Unknown operation type: ${type}`);
        }
    }

    validatePeerCorrectness(remotePublicKey, pendingRequestServiceEntry) {
        const senderPublicKeyHex = b4a.toString(remotePublicKey, 'hex');
        if (senderPublicKeyHex !== pendingRequestServiceEntry.requestedTo) {
            throw new V1InvalidPayloadError(
                `Response sender mismatch. Expected ${pendingRequestServiceEntry.requestedTo}, got ${senderPublicKeyHex}.`
            );
        }
    }

    validateResponseType(payload, pendingRequestServiceEntry) {
        let expectedResponseType;
        switch (pendingRequestServiceEntry.requestType) {
            case NetworkOperationType.LIVENESS_REQUEST:
                expectedResponseType = NetworkOperationType.LIVENESS_RESPONSE;
                break;
            case NetworkOperationType.BROADCAST_TRANSACTION_REQUEST:
                expectedResponseType = NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE;
                break;
            default:
                throw new V1UnexpectedError(`Unsupported pending request type: ${pendingRequestServiceEntry.requestType}.`);
        }

        if (payload.type !== expectedResponseType) {
            throw new V1InvalidPayloadError(
                `Response type mismatch for id ${pendingRequestServiceEntry.id}. Expected ${expectedResponseType}, got ${payload.type}.`
            );
        }
    }

}

export default V1BaseOperation;
