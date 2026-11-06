/**
 * @typedef {object} EpochVdfProof
 * @property {Buffer} solution Encoded Wesolowski proof.
 * @property {number} difficulty VDF iteration count from the signed consensus config.
 * @property {number} discriminantSizeBits Discriminant size used for this calculation.
 *
 * @typedef {object} EpochProofApproval
 * @property {Buffer} signature Verified proof signature from another indexer.
 * @property {Buffer} approver Signer address stored as a buffer.
 *
 * @typedef {object} EpochApprovalCollection
 * @property {Array<{key: Buffer}>} approvers Other indexers that can approve this proof.
 * @property {EpochProofApproval[]} approvals Accepted proof signatures from this attempt.
 * @property {Array<{member: {key: Buffer}, error: Error}>} rejections Failed requests from this attempt.
 * @property {boolean} closed True when enough signatures are collected or this attempt ends.
 */
import tracCryptoApi from "trac-crypto-api";
import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import addressUtils from '../../state/utils/address.js';
import b4a from "b4a";
import { encodeProofProposal, encodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../messages/state/applyStateMessageFactory.js';
import { toHex, uint16ToBuffer, uint32ToBuffer } from '../../../utils/buffer.js';
import { encodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';
import { ConsensusResultCode } from '../../../utils/constants.js';

/**
 * Builds proof messages and SET_EPOCH payloads, requests signatures and starts appends. The round uses
 * these methods and controls the FSM. The selector decides whether this node may append.
 */
export class EpochCoordinatorOperations {
    #state;
    #wallet;
    #vdfService;
    #config;

    /**
     * Sets up ledger access, the signing wallet, the VDF worker and message config.
     *
     * @param {import('../../state/State.js').default} state Signed ledger reads and the write queue that checks append authorization.
     * @param {import('./VDFService.js').VDFService} vdfService VDF service ready to calculate proofs.
     * @param {object} wallet Local signing wallet.
     * @param {object} config Network ID and address encoding config.
     */
    constructor(state, vdfService, wallet, config) {
        this.#state = state;
        this.#vdfService = vdfService;
        this.#wallet = wallet;
        this.#config = config;
    }

    /**
     * Calculates a proof using the challenge and signed VDF parameters from the round.
     *
     * @param {Buffer} challenge Encoded network, parent, proposer and VDF parameters.
     * @param {number} difficulty VDF iteration count.
     * @param {number} discriminantSizeBits Discriminant size in bits.
     * @returns {Promise<EpochVdfProof>} Calculated proof and the parameters used to create it.
     * @throws {Error} When the worker fails or closes.
     */
    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        const { result: vdfProof, error } = await this.#vdfService.calculateVDF(
            challenge,
            difficulty,
            discriminantSizeBits,
        );
        if (error) throw new Error(error);
        return { solution: vdfProof.solution, difficulty, discriminantSizeBits };
    }  

    /**
     * Builds and signs a proposal for the epoch after parentEpoch. Each message gets a new session ID.
     *
     * @param {bigint} parentEpoch Signed parent epoch number.
     * @param {Buffer} parentEpochHash Hash of the signed parent epoch.
     * @param {EpochVdfProof} vdfProof Local calculation result.
     * @returns {Promise<object>} Consensus message containing proof_proposal.
     */
    async createProofProposal(parentEpoch, parentEpochHash, vdfProof) {
        const targetEpoch = parentEpoch + 1n;
        const encodedDifficulty = uint32ToBuffer(vdfProof.difficulty);
        const encodedDiscriminantSize = uint16ToBuffer(vdfProof.discriminantSizeBits);
        return consensusMessageFactory(this.#wallet, this.#config)
            .buildProofProposal(
                generateUUID(),
                this.#config.networkId,
                targetEpoch,
                parentEpochHash,
                this.#wallet.address,
                encodedDifficulty,
                encodedDiscriminantSize,
                vdfProof.solution
            );
    }

    /**
     * Sends a proof approval request through an authenticated consensus connection.
     *
     * @param {string} approverPublicKeyHex Remote wallet public key, encoded as hex.
     * @param {object} proofProposalMessage Signed proof proposal message.
     * @param {import('../../network/services/IndexerConnectionManager.js').default} indexerConnectionManager Peer session manager.
     * @returns {Promise<{resultCode: number|undefined, signature: Buffer|undefined}>} Result code and signature from the protocol reply.
     */
    async sendProofApprovalRequest(approverPublicKeyHex, proofProposalMessage, indexerConnectionManager) {
        if (!indexerConnectionManager.connected(approverPublicKeyHex)) throw new Error('Indexer not in the manager');

        const approvalResponse = await indexerConnectionManager.send(approverPublicKeyHex, proofProposalMessage);
        return {
            resultCode: approvalResponse?.resultCode,
            signature: approvalResponse?.approval?.approval_sig,
        };
    }

    /**
     * Finds the wallet identity for an indexer and requests its proof signature. Checks whether the
     * collection is closed before sending. The round checks the collection again when the reply
     * arrives.
     *
     * @param {{key: Buffer}} approverIndexer External indexer from the attempt membership.
     * @param {{currentEpoch: bigint, currentEpochHash: Buffer, vdf: EpochVdfProof}} proofContext Parent and local proof.
     * @param {import('../../network/services/IndexerConnectionManager.js').default} indexerConnectionManager Authenticated consensus sessions.
     * @param {EpochApprovalCollection|null} [approvalCollection=null] Approval collection. A closed collection stops the request before sending.
     * @returns {Promise<EpochProofApproval>} Approval data to be added by the round.
     * @throws {Error} If identity lookup, request delivery or approval validation fails.
     */
    async requestProofApproval(approverIndexer, {currentEpoch, currentEpochHash, vdf: vdfProof}, indexerConnectionManager, approvalCollection = null) {
        // Each peer request needs its own RPC session ID; the signed proposal content stays the same.
        const proofProposalMessage = await this.createProofProposal(currentEpoch, currentEpochHash, vdfProof);
        const writerKeyHex = toHex(approverIndexer.key);
        const approverAddressBuffer = await this.#state.getRegisteredWriterKey(writerKeyHex);
        if (!approverAddressBuffer) throw new Error('Registered writer key not found');

        const approverAddress = addressUtils.bufferToAddress(approverAddressBuffer, this.#config.addressPrefix);
        if (!approverAddress) throw new Error('Writer address could not be decoded');

        const approverPublicKey = tracCryptoApi.address.decode(approverAddress);
        if (!approverPublicKey) throw new Error('Writer public key could not be decoded');

        const approverPublicKeyHex = toHex(approverPublicKey);
        if (approvalCollection?.closed) throw new Error('Epoch approval request was cancelled');

        const { resultCode, signature: approvalSignature } = await this.sendProofApprovalRequest(approverPublicKeyHex, proofProposalMessage, indexerConnectionManager);

        if (resultCode !== ConsensusResultCode.OK) {
            const approvalError = new Error(`Approval rejected with result code ${resultCode}`);
            approvalError.resultCode = resultCode;
            throw approvalError;
        }

        if (!approvalSignature) throw new Error('Approval signature not received');

        return {
            signature: approvalSignature,
            approver: approverAddressBuffer
        };
    }

    /**
     * Encodes a SET_EPOCH operation from the local proposal and external approvals.
     *
     * @param {object} proofProposal Signed protocol proof fields.
     * @param {EpochProofApproval[]} proofApprovals Signatures from other indexers. proofProposal contains the proposer signature.
     * @returns {Promise<Buffer>} Encoded SET_EPOCH operation ready for appender selection.
     */
    async buildSetEpochPayload(proofProposal, proofApprovals) {
        const encodedProofProposal = encodeProofProposal({
            network_id: proofProposal.network_id,
            epoch: proofProposal.epoch,
            previous_epoch_record_hash: proofProposal.previous_epoch_record_hash,
            proposer: proofProposal.proposer,
            difficulty: proofProposal.difficulty,
            discriminant_bit_size: proofProposal.discriminant_bit_size,
            proof: proofProposal.proof,
            signature: proofProposal.signature,
        });
        const encodedApprovals = proofApprovals.map(({ signature, approver }) =>
            encodeProofProposalApproval({
                approver,
                approval_sig: signature,
            })
        );
        const message = await applyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteSetEpochMessage(this.#wallet.address, encodedProofProposal, encodedApprovals);
        return encodeApplyOperation(message);
    }

    /**
     * Queues the epoch append. Calls authorizeEpochAppend just before Autobase.append. Completing the
     * local write does not confirm the epoch. The round still checks its signed result.
     *
     * @param {Buffer} epochPayload Exact bytes reserved by the appender selection.
     * @param {function({writerKey: string, from: number}): Promise<void>} authorizeEpochAppend Checks the selection and saves the append details locally.
     * @returns {Promise<void>} Result returned by the write queue.
     */
    appendSetEpoch(epochPayload, authorizeEpochAppend) {
        return this.#state.appendEpoch(epochPayload, authorizeEpochAppend);
    }

    /**
     * Returns all indexers except the local writer. An admin who is also an indexer can approve the
     * proof.
     *
     * @param {Array<{key: Buffer}>} indexers Indexer list read for this attempt.
     * @returns {Array<{key: Buffer}>} Other indexers that can approve the proof.
     */
    getProofApprovers(indexers) {
        const writingKey = this.#state.writingKey;
        return indexers.filter(({ key: writerKey }) => !b4a.equals(writerKey, writingKey));
    }
}
