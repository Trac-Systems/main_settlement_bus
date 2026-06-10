import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {encodeProofProposalApproval} from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import {addressToBuffer, isAddressValid} from "../../../core/state/utils/address.js";
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode
} from '../../../utils/constants.js';
import {
    createMessage,
    safeWriteUInt32BE,
    uint8ToBuffer,
    uint16ToBuffer,
    uint64ToBuffer
} from "../../../utils/buffer.js";
import {
    createProofProposalApprovalSigningMessage,
    createProofProposalSigningMessage
} from "../../../core/consensus/v1/consensusSigningMessage.js";

class ConsensusMessageBuilder {
    #wallet;
    #config;
    #header;
    #type;
    #session_id;
    #timestamp;
    #protocol_version;
    #network_id;
    #epoch;
    #previous_epoch_record_hash;
    #proposer;
    #vdf_parameters_hash;
    #vdf_proof;
    #resultCode;
    #approver;
    #body;
    #payloadKey;
    #requester_proof_signature;

    constructor(wallet, config) {
        this.#config = config;
        this.#wallet = wallet;
    }

    #validateBuffer(value, fieldName) {
        if (!b4a.isBuffer(value)) {
            throw new Error(`${fieldName} must be a buffer.`);
        }

        return value;
    }

    #validateAddress(address, fieldName) {
        if (typeof address !== 'string' || !isAddressValid(address, this.#config.addressPrefix)) {
            throw new Error(`${fieldName} must be a valid TRAC address.`);
        }

        try {
            const publicKey = tracCryptoApi.address.decode(address);
            const canonicalAddress = tracCryptoApi.address.encode(this.#config.addressPrefix, publicKey);
            if (canonicalAddress !== address) {
                throw new Error('Address is not canonical for configured prefix.');
            }

            return addressToBuffer(address, this.#config.addressPrefix);
        } catch {
            throw new Error(`${fieldName} must be a valid TRAC address.`);
        }
    }

    #setHeader() {
        if (!this.#type) throw new Error('Header requires type to be set');
        if (!this.#session_id) throw new Error('Header requires session to be set');
        if (!this.#timestamp) throw new Error('Header requires a timestamp provider');
        //if (!Array.isArray(this.#capabilities)) throw new Error('Header requires capabilities array');

        this.#header = {
            type: this.#type,
            session_id: this.#session_id,
            timestamp: this.#timestamp,
            //capabilities: this.#capabilities,
        };
        return this;
    }

    setType(type) {
        if (!Object.values(ConsensusOperationType).includes(type)) {
            throw new Error(`Invalid consensus operation type: ${type}`);
        }
        this.#type = type;
        return this;
    }

    setSessionId(sessionId) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
            throw new Error('Session id must be a non-empty string.');
        }

        this.#session_id = sessionId;
        return this;
    }

    setTimestamp() {
        this.#timestamp = Date.now();
        return this;
    }

    setProtocolVersion(protocolVersion) {
        const value = uint8ToBuffer(protocolVersion, 'Protocol version');
        if (!Object.values(ConsensusProtocolVersion).includes(protocolVersion)) {
            throw new Error(`Unsupported consensus protocol version: ${protocolVersion}`);
        }

        this.#protocol_version = value;
        return this;
    }

    setNetworkId(networkId) {
        this.#network_id = uint16ToBuffer(networkId, 'Network id');
        return  this;
    }

    setEpoch(epoch) {
        this.#epoch = uint64ToBuffer(epoch, 'Epoch');
        return this;
    }

    setPreviousEpochRecordHash(previousEpochRecordHash) {
        this.#previous_epoch_record_hash = this.#validateBuffer(
            previousEpochRecordHash,
            'Previous epoch record hash'
        );
        return this;
    }

    setProposer(proposer) {
        this.#proposer = this.#validateAddress(proposer, 'Proposer');
        return this;
    }

    setVdfParametersHash(vdfParametersHash) {
        this.#vdf_parameters_hash = this.#validateBuffer(
            vdfParametersHash,
            'VDF parameters hash'
        );
        return this;
    }

    setVdfProof(vdfProof) {
        this.#vdf_proof = this.#validateBuffer(vdfProof, 'VDF proof');
        return this;
    }


    setResultCode(code) {
        if (!Object.values(ConsensusResultCode).includes(code)) {
            throw new Error(`Invalid consensus result code: ${code}`);
        }

        this.#resultCode = code;
        return this;
    }

    setApprover(approver) {
        this.#approver = this.#validateAddress(approver, 'Approver');
        return this;
    }

    setRequesterProofSignature(proofSignature) {
        this.#requester_proof_signature = this.#validateBuffer(
            proofSignature,
            'Requester proof signature'
        );
        return this;
    }

    async #buildProofProposalPayload() {
        const message = createProofProposalSigningMessage(
            this.#protocol_version,
            this.#network_id,
            this.#epoch,
            this.#previous_epoch_record_hash,
            this.#proposer,
            this.#vdf_parameters_hash,
            this.#vdf_proof
        );
        const hash = await tracCryptoApi.hash.blake3(message);
        const signature = this.#wallet.sign(hash);
        this.#payloadKey = 'proof_proposal';
        this.#body = {
            protocol_version: this.#protocol_version,
            network_id: this.#network_id,
            epoch: this.#epoch,
            previous_epoch_record_hash: this.#previous_epoch_record_hash,
            proposer: this.#proposer,
            vdf_parameters_hash: this.#vdf_parameters_hash,
            vdf_proof: this.#vdf_proof,
            signature: signature,
        };
    }

    async #buildProofProposalResponsePayload() {
        if (this.#resultCode === undefined) {
            throw new Error('Result code must be set before build.');
        }

        const messageApproval = createProofProposalApprovalSigningMessage(
            this.#protocol_version,
            this.#network_id,
            this.#epoch,
            this.#previous_epoch_record_hash,
            this.#proposer,
            this.#vdf_parameters_hash,
            this.#vdf_proof,
            this.#approver,
            this.#requester_proof_signature
        );
        const hashApproval = await tracCryptoApi.hash.blake3(messageApproval);
        const signatureApproval = this.#wallet.sign(hashApproval);

        const proofProposalApproval = {
            approver: this.#approver,
            approval_sig: signatureApproval,
        };

        const encodedApproval = encodeProofProposalApproval(proofProposalApproval);
        const responseMessage = createMessage(
            safeWriteUInt32BE(this.#resultCode, 0),
            encodedApproval
        );
        const responseHash = await tracCryptoApi.hash.blake3(responseMessage);
        const responseSig = this.#wallet.sign(responseHash);

        this.#payloadKey = 'proof_proposal_response';
        this.#body = {
            result: this.#resultCode,
            approval: proofProposalApproval,
            response_sig: responseSig,
        };
    }

    async buildPayload() {
        this.#setHeader();

        switch (this.#type) {
            case ConsensusOperationType.PROOF_PROPOSAL: {
                await this.#buildProofProposalPayload();
                break;
            }
            case ConsensusOperationType.PROOF_PROPOSAL_RESPONSE: {
                await this.#buildProofProposalResponsePayload();
                break;
            }
            default:
                throw new Error(`Unsupported consensus type ${this.#type}`);
        }
    }

    getResult() {
        if (!this.#header || !this.#payloadKey || !this.#body) {
            throw new Error('Header or payload not set before getResult');
        }

        return {
            ...this.#header,
            [this.#payloadKey]: this.#body
        };
    }


}

export default ConsensusMessageBuilder;
