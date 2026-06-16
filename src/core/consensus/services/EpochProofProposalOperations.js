import { buildProofData } from '../../consensus/v1/handlers/epochProposal/epochProofData.js';
import { addressToBuffer } from "../../state/utils/address.js";
import tracCryptoApi from "trac-crypto-api";
import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import addressUtils from '../../state/utils/address.js';
import b4a from "b4a";
import { safeEncodeProofProposal, safeEncodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../messages/state/applyStateMessageFactory.js';

const PROTOCOL_VERSION = 1;

export class EpochProofProposalOperations {
    #state;
    #wallet;
    #vdfService;
    #config;
    #connectionManager;

    constructor(state, vdfService, wallet, connectionManager, config) {
        this.#state = state;
        this.#vdfService = vdfService;
        this.#wallet = wallet;
        this.#config = config;
        this.#connectionManager = connectionManager;
    }

    async calculateVDF() {
        const prevEpochId = await this.#state.currentEpochId();
        const currentEpochHash = await this.#state.getEpochHash(prevEpochId);
        const vdf = await this.#vdfService.calculateVDF(
            currentEpochHash,
            this.#config.vdfDifficulty,
            this.#config.vdfDiscriminantSizeBits,
        );
        return { prevEpochId, currentEpochHash, solution: vdf.solution };
    }

    createProposal(prevEpochId, lastEpochHash, vdf) {
        const currentEpochId = prevEpochId + 1;
        return buildProofData({
            protocolVersion: PROTOCOL_VERSION,
            epoch: currentEpochId,
            prevEpochHash: lastEpochHash,
            networkId: this.#config.networkId,
            proposer: addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
            vdfParamsHash: vdf.solution.slice(0, 258),
            vdfProof: vdf.solution.slice(258),
        });
    }

    async verifySignature(signature, hash, publicKey) {
        try {
            return tracCryptoApi.signature.verify(signature, hash, publicKey);
        } catch {
            return false;
        }
    }

    async sendToIndexer(member, proofProposal) {
        const connection = this.#connectionManager.getConnection(member.key);
        if (!connection) return null;

        const request = await consensusMessageFactory(this.#wallet, this.#config)
            .buildProofProposal(
                generateUUID(), 
                this.#config.networkId, 
                proofProposal.epoch, 
                proofProposal.prevEpochHash, 
                proofProposal.proposer, 
                proofProposal.vdfParamsHash, 
                proofProposal.vdfProof
            );

        const response = await connection.protocolSession.send(request);
        return response?.result?.signature ?? null;
    }

    async collectSignature(member, proofProposal) {
        const key = b4a.toString(member.key, "hex");
        const addressBuffer = await this.#state.getRegisteredWriterKey(key);
        if (!addressBuffer) return null;

        const address = addressUtils.bufferToAddress(addressBuffer, this.#config.addressPrefix);
        if (!address) return null;

        if (address === this.#wallet.address) return null;

        const memberSignature = await this.sendToIndexer(member, proofProposal);
        if (!memberSignature) return null;

        const isValidSignature = await this.verifySignature(memberSignature, proofProposal.dataHash, member.key);
        if (!isValidSignature) return null;

        return { signature: memberSignature, publicKey: member.key };
    }
    
    async appendEpoch(epoch) {
        const proofData = safeEncodeProofProposal({
            protocol_version: epoch.data.protocolVersion,
            network_id: epoch.data.networkId,
            epoch: epoch.data.epoch,
            previous_epoch_record_hash: epoch.data.prevEpochHash,
            proposer: this.#state.writingKey,
            vdf_parameters_hash: epoch.data.vdfParamsHash,
            vdf_proof: epoch.data.vdfProof,
            signature: epoch.signature,
        });
        const approvals = epoch.signatures.map(({ signature, publicKey }) =>
            safeEncodeProofProposalApproval({
                approval_sig: signature,
                member_id: b4a.isBuffer(publicKey) ? publicKey : b4a.from(publicKey, 'hex'),
            })
        );
        const payload = await applyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteSetEpochMessage(this.#wallet.address, proofData, approvals);
        await this.#state.append(payload);
    }    
}