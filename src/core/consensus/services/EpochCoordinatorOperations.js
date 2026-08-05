import tracCryptoApi from "trac-crypto-api";
import { generateUUID, publicKeyToAddress } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import addressUtils, { addressToBuffer } from '../../state/utils/address.js';
import b4a from "b4a";
import { safeEncodeProofProposal, safeEncodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../messages/state/applyStateMessageFactory.js';
import { uint16ToBuffer, uint32ToBuffer } from '../../../utils/buffer.js';
import { safeEncodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';
import { encodeVdfParameters } from '../../state/utils/epochProof.js';
import { blake3 } from 'trac-crypto-api/modules/hash.js';
import { ConsensusResultCode } from '../../../utils/constants.js';

/** connectionManager is passed per call, not stored on the instance. */
export class EpochCoordinatorOperations {
    #state;
    #wallet;
    #vdfService;
    #config;

    constructor(state, vdfService, wallet, config) {
        this.#state = state;
        this.#vdfService = vdfService;
        this.#wallet = wallet;
        this.#config = config;
    }

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

    async createProofProposal(prevEpochId, prevEpochHash, vdf) {
        const epoch = prevEpochId + 1n;
        const difficulty = uint32ToBuffer(vdf.difficulty)
        const discriminantSizeBits = uint16ToBuffer(vdf.discriminantSizeBits)
        const vdfData = encodeVdfParameters(difficulty, discriminantSizeBits)
        const vdfParamsHash = await blake3(vdfData)
        return consensusMessageFactory(this.#wallet, this.#config)
            .buildProofProposal(
                generateUUID(),
                this.#config.networkId,
                epoch,
                prevEpochHash,
                this.#wallet.address,
                vdfParamsHash,
                vdf.solution
            );
    }

    async sendToIndexer(publicKeyHex, request, connectionManager) {
        if (!connectionManager.connected(publicKeyHex)) throw new Error('Indexer not in the manager');

        const response = await connectionManager.send(publicKeyHex, request);
        return {
            resultCode: response?.resultCode,
            signature: response?.approval?.approval_sig,
        };
    }

    async collectSignature(member, {currentEpoch, currentEpochHash, vdf}, connectionManager) {
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
        const { resultCode, signature: memberSignature } = await this.sendToIndexer(publicKeyHex, request, connectionManager);

        if (resultCode !== ConsensusResultCode.OK) {
            const err = new Error(`Approval rejected with result code ${resultCode}`);
            err.resultCode = resultCode;
            throw err;
        }

        if (!memberSignature) throw new Error('Approval signature not received');

        return {
            signature: memberSignature,
            approver: addressToBuffer(
                publicKeyToAddress(publicKey, this.#config),
                this.#config.addressPrefix
            )
        };
    }

    async buildSetEpochPayload(proofProposal, signatures) {
        const proofData = safeEncodeProofProposal({
            protocol_version: proofProposal.protocol_version,
            network_id: proofProposal.network_id,
            epoch: proofProposal.epoch,
            previous_epoch_record_hash: proofProposal.previous_epoch_record_hash,
            proposer: proofProposal.proposer,
            vdf_parameters_hash: proofProposal.vdf_parameters_hash,
            vdf_proof: proofProposal.vdf_proof,
            signature: proofProposal.signature,
        });
        const approvals = signatures.map(({ signature, approver }) =>
            safeEncodeProofProposalApproval({
                approver,
                approval_sig: signature,
            })
        );
        const message = await applyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteSetEpochMessage(this.#wallet.address, proofData, approvals);
        return safeEncodeApplyOperation(message);
    }

    async appendSetEpoch(payload) {
        return await this.#state.append(payload);
    }

    /** Excludes only self - an admin/indexer counts as a normal approver. */
    async approvers() {
        const indexers = await this.#state.getIndexersEntry();
        const writingKey = this.#state.writingKey;
        return indexers.filter(({ key }) => !b4a.equals(key, writingKey));
    }
}
