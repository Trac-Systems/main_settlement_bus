import { buildProofData } from '../../consensus/v1/handlers/epochProposal/epochProofData.js';
import { addressToBuffer } from "../../state/utils/address.js";
import tracCryptoApi from "trac-crypto-api";
import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import addressUtils from '../../state/utils/address.js';
import b4a from "b4a";
import { safeEncodeProofProposal, safeEncodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../messages/state/applyStateMessageFactory.js';
import { uint8ToBuffer, uint16ToBuffer, uint64ToBuffer } from '../../../utils/buffer.js';
import { safeEncodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';

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

    async calculateVDF(prevEpochId = null, currentEpochHash = null) {
        if (prevEpochId === null) prevEpochId = await this.#state.currentEpochId();
        if (currentEpochHash === null) currentEpochHash = await this.#state.getEpochHash(prevEpochId);
        console.log('[calculateVDF] prevEpochId:', prevEpochId, 'epochHash:', currentEpochHash?.toString('hex') ?? 'null');
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

    async sendToIndexer(publicKeyHex, proofProposal) {
        const connection = this.#connectionManager.getConnection(publicKeyHex);
        const consensusSession = connection?.consensusProtocolSession;
        if (!consensusSession) return null;

        const { data } = proofProposal;
        console.log('[sendToIndexer] data:', { epoch: data?.epoch, hasProposer: !!data?.proposer, hasPrevHash: !!data?.prevEpochHash });

        const proposerAddress = addressUtils.bufferToAddress(data.proposer, this.#config.addressPrefix);

        let request;
        try {
            request = await consensusMessageFactory(this.#wallet, this.#config)
                .buildProofProposal(
                    generateUUID(),
                    this.#config.networkId,
                    data.epoch,
                    data.prevEpochHash,
                    proposerAddress,
                    data.vdfParamsHash,
                    data.vdfProof
                );
            console.log('[sendToIndexer] request built ok');
        } catch (err) {
            console.error('[sendToIndexer] build failed:', err.message);
            return null;
        }

        try {
            const response = await consensusSession.send(request);
            console.log('[sendToIndexer] response:', response?.code, !!response?.result?.approval_sig);
            return response?.result?.approval_sig ?? null;
        } catch (err) {
            console.error('[sendToIndexer] send failed:', err.message);
            return null;
        }
    }

    async collectSignature(member, proofProposal) {
        const key = b4a.toString(member.key, "hex");
        const addressBuffer = await this.#state.getRegisteredWriterKey(key);
        if (!addressBuffer) return null;

        const address = addressUtils.bufferToAddress(addressBuffer, this.#config.addressPrefix);
        if (!address) return null;

        if (address === this.#wallet.address) return null;

        const publicKey = tracCryptoApi.address.decode(address);
        if (!publicKey) return null;

        const publicKeyHex = b4a.toString(publicKey, 'hex');
        console.log('[collectSignature] pk:', publicKeyHex.slice(0, 8), 'connected:', !!this.#connectionManager.getConnection(publicKeyHex));

        const memberSignature = await this.sendToIndexer(publicKeyHex, proofProposal);
        if (!memberSignature) return null;

        return { signature: memberSignature, publicKey: member.key };
    }
    
    async appendEpoch(epoch) {
        const proofData = safeEncodeProofProposal({
            protocol_version: uint8ToBuffer(epoch.data.protocolVersion),
            network_id: uint16ToBuffer(epoch.data.networkId),
            epoch: uint64ToBuffer(epoch.data.epoch),
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
        const message = await applyStateMessageFactory(this.#wallet, this.#config)
            .buildCompleteSetEpochMessage(this.#wallet.address, proofData, approvals);
        const payload = safeEncodeApplyOperation(message);
        await this.#state.append(payload);
    }    
}
