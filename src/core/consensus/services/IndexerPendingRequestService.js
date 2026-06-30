import {ConsensusOperationType, PEER_PUBLIC_KEY_HEX_LENGTH, ConsensusResultCode} from '../../../utils/constants.js';
import {isHexString, publicKeyToAddress} from '../../../utils/helpers.js';
import {V1ConsensusProtocolError} from "../v1/V1ConsensusProtocolError.js";
import BasePendingRequestService from '../../shared/BasePendingRequestService.js';

export class IndexerPendingRequestServiceTimeoutError extends Error {
    constructor(requestId, peerAddress, timeoutMs) {
        super(`Pending request ${requestId} to peer ${peerAddress} timed out after ${timeoutMs} ms.`);
        this.name = this.constructor.name;
    }
}

export default class IndexerPendingRequestService extends BasePendingRequestService {
    #config;

    constructor(config) {
        super();
        this.#config = config;
    }

    #validateRegisterInput(peerPubKeyHex, message) {
        if (!isHexString(peerPubKeyHex) || peerPubKeyHex.length !== PEER_PUBLIC_KEY_HEX_LENGTH) {
            throw new Error('Invalid peer public key. Expected 32-byte hex string.');
        }

        if (typeof message?.session_id !== 'string' || message?.session_id.length === 0) {
            throw new Error('Pending request ID must be a non-empty string.');
        }

        if (message.type !== ConsensusOperationType.PROOF_PROPOSAL) {
            throw new Error('Unsupported pending request type');
        }
    }

    /*
    @returns {Promise}
    */
    registerPendingRequest(peerPubKeyHex, message) {
        this.#validateRegisterInput(peerPubKeyHex, message);
        const id = message.session_id;
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
            requestedTo: peerPubKeyHex,
            proofProposal: message.proof_proposal,
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
                new IndexerPendingRequestServiceTimeoutError(
                    id,
                    peerAddress,
                    this.#config.indexerPendingRequestTimeout
                )
            );

        }, this.#config.indexerPendingRequestTimeout);

        this._pendingRequests.set(id, entry);
        return promise;
    }

    // for now, we are resolving only resultCode, but we can extend it in the future if needed...
    resolvePendingRequest(id, resultCode = ConsensusResultCode.OK) {
        const entry = this.getAndDeletePendingRequest(id);
        if (!entry) return false;
        entry.resolve(resultCode);
        return true;
    }

    _createShutdownError(id) {
        return new V1ConsensusProtocolError(
            ConsensusResultCode.UNEXPECTED_ERROR,
            `Pending request ${id} cancelled (shutdown).`
        );
    }    
}
