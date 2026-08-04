import {NetworkOperationType, PEER_PUBLIC_KEY_HEX_LENGTH, ResultCode} from '../../../utils/constants.js';
import {isHexString, publicKeyToAddress} from '../../../utils/helpers.js';
import {V1ProtocolError} from "../protocols/v1/V1ProtocolError.js";
import b4a from 'b4a';
import BasePendingRequestService from '../../shared/BasePendingRequestService.js';

export class ValidatorPendingRequestServiceTimeoutError extends Error {
    constructor(requestId, peerAddress, timeoutMs) {
        super(`Pending request ${requestId} to peer ${peerAddress} timed out after ${timeoutMs} ms.`);
        this.name = this.constructor.name;
    }
}

export default class ValidatorPendingRequestService extends BasePendingRequestService {
    #requestMessageTypes = [NetworkOperationType.LIVENESS_REQUEST, NetworkOperationType.BROADCAST_TRANSACTION_REQUEST];
    #config;

    constructor(config) {
        super();
        this.#config = config;
    }

    isProbePending(peerPubKeyHex) {
        for (const [, entry] of this._pendingRequests) {
            if (entry.requestedTo === peerPubKeyHex && entry.requestType === NetworkOperationType.LIVENESS_REQUEST) {
                return true;
            }
        }
        return false;
    }

    #validateRegisterInput(peerPubKeyHex, message) {
        if (!isHexString(peerPubKeyHex) || peerPubKeyHex.length !== PEER_PUBLIC_KEY_HEX_LENGTH) {
            throw new Error('Invalid peer public key. Expected 32-byte hex string.');
        }

        if (typeof message?.id !== 'string' || message?.id.length === 0) {
            throw new Error('Pending request ID must be a non-empty string.');
        }

        if (!this.#requestMessageTypes.includes(message?.type)) {
            throw new Error('Unsupported pending request type.');
        }
    }

    /*
    @returns {Promise}
    */
    registerPendingRequest(peerPubKeyHex, message) {
        this.#validateRegisterInput(peerPubKeyHex, message);
        const id = message.id;
        const peerAddress = publicKeyToAddress(peerPubKeyHex, this.#config);
        if (this._pendingRequests.size >= this.#config.maxPendingRequestsInPendingRequestsService) {
            throw new Error('Maximum number of pending requests reached.');
        }

        if (this._pendingRequests.has(id)) {
            throw new Error(`Pending request with ID ${id} from peer ${peerPubKeyHex} already exists.`);
        }

        const entry = {
            id: id,
            requestType: message.type,
            requestTxData: this.#extractRequestTxData(message),
            requestedTo: peerPubKeyHex,
            timeoutId: null,
            resolve: null,
            reject: null,
        }

        const promise = new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;
        });

        entry.timeoutId = setTimeout(() => {
            this.rejectPendingRequest(
                id,
                new ValidatorPendingRequestServiceTimeoutError(
                    id,
                    peerAddress,
                    this.#config.pendingRequestTimeout
                )
            );

        }, this.#config.pendingRequestTimeout);

        this._pendingRequests.set(id, entry);
        return promise;
    }

    #extractRequestTxData(message) {
        if (message.type !== NetworkOperationType.BROADCAST_TRANSACTION_REQUEST) return null;
        const txData = message.broadcast_transaction_request?.data;
        return b4a.isBuffer(txData) ? txData : null;
    }

    // for now, we are resolving only resultCode, but we can extend it in the future if needed...
    resolvePendingRequest(id, resultCode = ResultCode.OK) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.resolve(resultCode);
        return true;
    }

    _createShutdownError(id) {
        return new V1ProtocolError(
            ResultCode.UNEXPECTED_ERROR,
            `Pending request ${id} cancelled (shutdown).`
        );
    }
}
