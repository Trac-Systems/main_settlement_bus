import tracCryptoApi from "trac-crypto-api";
import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import addressUtils from '../../state/utils/address.js';
import b4a from "b4a";
import { encodeProofProposal, encodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../messages/state/applyStateMessageFactory.js';
import { uint16ToBuffer, uint32ToBuffer } from '../../../utils/buffer.js';
import { encodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';
import { ConsensusResultCode } from '../../../utils/constants.js';

/** Contains operations used by the epoch coordinator. */
export class EpochCoordinatorOperations {
    #state;
    #wallet;
    #vdfService;
    #config;

    /** Creates operations which use the provided state, wallet and VDF service. */
    constructor(state, vdfService, wallet, config) {
        this.#state = state;
        this.#vdfService = vdfService;
        this.#wallet = wallet;
        this.#config = config;
    }

    /** Calculates a VDF proof and returns data used by the round. */
    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        const { result, error } = await this.#vdfService.calculateVDF(
            challenge,
            difficulty,
            discriminantSizeBits,
        );
        if (error) throw new Error(error);
        const vdf = result;
        return { solution: vdf.solution, difficulty, discriminantSizeBits };
    }  

    /** Builds and signs a proof proposal for the next epoch. */
    async createProofProposal(prevEpochId, prevEpochHash, vdf) {
        const epoch = prevEpochId + 1n;
        const difficulty = uint32ToBuffer(vdf.difficulty)
        const discriminantSizeBits = uint16ToBuffer(vdf.discriminantSizeBits)
        return consensusMessageFactory(this.#wallet, this.#config)
            .buildProofProposal(
                generateUUID(),
                this.#config.networkId,
                epoch,
                prevEpochHash,
                this.#wallet.address,
                difficulty,
                discriminantSizeBits,
                vdf.solution
            );
    }

    /** Sends one consensus request to a connected indexer. */
    async sendToIndexer(publicKeyHex, request, connectionManager) {
        if (!connectionManager.connected(publicKeyHex)) throw new Error('Indexer not in the manager');

        const response = await connectionManager.send(publicKeyHex, request);
        return {
            resultCode: response?.resultCode,
            signature: response?.approval?.approval_sig,
        };
    }

    /**
     * Builds a proposal for one indexer and requests its signature.
     * It checks approval collection before sending, because the round can be cancelled during
     * async request preparation.
     */
    async collectSignature(member, {currentEpoch, currentEpochHash, vdf}, connectionManager, approvalCollection = null) {
        // Unfortunally we need to generate one payload per request because of the session id.
        // But, we also need a general one (generated previously) because of the signature
        const request = await this.createProofProposal(currentEpoch, currentEpochHash, vdf);
        const key = b4a.toString(member.key, "hex");
        const addressBuffer = await this.#state.getRegisteredWriterKey(key);
        if (!addressBuffer) throw new Error('Registered writer key not found');

        const address = addressUtils.bufferToAddress(addressBuffer, this.#config.addressPrefix);
        if (!address) throw new Error('Writer address could not be decoded');

        const publicKey = tracCryptoApi.address.decode(address);
        if (!publicKey) throw new Error('Writer public key could not be decoded');

        const publicKeyHex = b4a.toString(publicKey, 'hex');
        if (approvalCollection?.closed) throw new Error('Epoch approval request was cancelled');

        const { resultCode, signature: memberSignature } = await this.sendToIndexer(publicKeyHex, request, connectionManager);

        if (resultCode !== ConsensusResultCode.OK) {
            const err = new Error(`Approval rejected with result code ${resultCode}`);
            err.resultCode = resultCode;
            throw err;
        }

        if (!memberSignature) throw new Error('Approval signature not received');

        return {
            signature: memberSignature,
            approver: addressBuffer
        };
    }

    /** Creates a SET_EPOCH payload from the proof and collected signatures. */
    async buildSetEpochPayload(proofProposal, signatures) {
        const proofData = encodeProofProposal({
            network_id: proofProposal.network_id,
            epoch: proofProposal.epoch,
            previous_epoch_record_hash: proofProposal.previous_epoch_record_hash,
            proposer: proofProposal.proposer,
            difficulty: proofProposal.difficulty,
            discriminant_bit_size: proofProposal.discriminant_bit_size,
            proof: proofProposal.proof,
            signature: proofProposal.signature,
        });
        const approvals = signatures.map(({ signature, approver }) =>
            encodeProofProposalApproval({
                approver,
                approval_sig: signature,
            })
        );
        const message = await applyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteSetEpochMessage(this.#wallet.address, proofData, approvals);
        return encodeApplyOperation(message);
    }

    /** Appends the SET_EPOCH payload to local state. */
    appendSetEpoch(payload) {
        return this.#state.append(payload);
    }

    /** Returns all indexers except this node; an admin/indexer still counts as an approver. */
    async approvers() {
        const indexers = await this.#state.getIndexersEntry();
        const writingKey = this.#state.writingKey;
        return indexers.filter(({ key }) => !b4a.equals(key, writingKey));
    }
}
