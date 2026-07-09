import { addressToBuffer } from "../../state/utils/address.js";
import tracCryptoApi from "trac-crypto-api";
import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import addressUtils from '../../state/utils/address.js';
import b4a from "b4a";
import { safeEncodeProofProposal, safeEncodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../messages/state/applyStateMessageFactory.js';
import { uint8ToBuffer, uint16ToBuffer, uint64ToBuffer, uint32ToBuffer } from '../../../utils/buffer.js';
import { safeEncodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';
import { encodeVdfParameters } from '../../state/utils/epochProof.js';
import { blake3 } from 'trac-crypto-api/modules/hash.js';
import { createMessage } from '../../../utils/buffer.js';

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

    async calculateVDF(currentEpochHash, difficulty, discriminantSizeBits) {
        const vdf = await this.#vdfService.calculateVDF(
            currentEpochHash,
            difficulty,
            discriminantSizeBits,
        );
        return { solution: vdf.solution, difficulty, discriminantSizeBits };
    }

    async createProposal(prevEpochId, prevEpochHash, vdf) {
        const epoch = prevEpochId + 1n;
        const difficulty = uint32ToBuffer(vdf.difficulty)
        const discriminantSizeBits = uint16ToBuffer(vdf.discriminantSizeBits)
        const vdfData = encodeVdfParameters(difficulty, discriminantSizeBits)
        const vdfParamsHash = await blake3(vdfData)
        return { data: {
            epoch,
            prevEpochHash,
            vdfParamsHash,
            vdfProof: vdf.solution
        }}
    }

    async verifySignature(signature, hash, publicKey) {
        try {
            return tracCryptoApi.signature.verify(signature, hash, publicKey);
        } catch {
            return false;
        }
    }

    async sendToIndexer(publicKeyHex, { data }) {
        if (!this.#connectionManager.connected(publicKeyHex)) throw new Error('Validator not in the manager');

        let request = await consensusMessageFactory(this.#wallet, this.#config)
            .buildProofProposal(
                generateUUID(),
                this.#config.networkId,
                data.epoch,
                data.prevEpochHash,
                this.#wallet.address,
                data.vdfParamsHash,
                data.vdfProof
            );

        const response = await this.#connectionManager.send(publicKeyHex, request);
        return response?.approval?.approval_sig
    }

    async collectSignature(member, proofProposal) {
        const key = b4a.toString(member.key, "hex");
        const addressBuffer = await this.#state.getRegisteredWriterKey(key);
        if (!addressBuffer) throw new Error('Registered writer key not found');

        const address = addressUtils.bufferToAddress(addressBuffer, this.#config.addressPrefix);
        if (!address) throw new Error('Writer address could not be decoded');

        const publicKey = tracCryptoApi.address.decode(address);
        if (!publicKey) throw new Error('Writer public key could not be decoded');

        const publicKeyHex = b4a.toString(publicKey, 'hex');
        const memberSignature = await this.sendToIndexer(publicKeyHex, proofProposal);

        // tratar esse erro pois é critico, só nulo não resolve, tem que checar a signature antes.
        if (!memberSignature) throw new Error('Approval signature not received');

        return { signature: memberSignature, publicKey };
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

    async approvers() {
        const indexers = await this.#state.getIndexersEntry();
        const writingKey = this.#state.writingKey;
        const adminEntry = await this.#state.getAdminEntry();
        return indexers.filter(({ key }) =>
            !b4a.equals(key, writingKey) &&
            !(adminEntry && b4a.equals(key, adminEntry.wk))
        );
    }
}
