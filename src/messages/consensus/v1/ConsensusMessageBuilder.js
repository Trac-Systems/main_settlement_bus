import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { encodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { addressToBuffer, isAddressValid } from "../../../core/state/utils/address.js";
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode
} from '../../../utils/constants.js';
import {
    createMessage,
    uint8ToBuffer,
    uint16ToBuffer,
    uint64ToBuffer, uint32ToBuffer
} from "../../../utils/buffer.js";

class ConsensusMessageBuilder {
    #wallet;
    #config;
    #header;
    #type;
    #session_id;
    #timestamp;
    #network_id;
    #epoch;
    #previous_epoch_record_hash;
    #proposer;
    #difficulty;
    #discriminant_bit_size;
    #proof;
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

        this.#header = {
            type: this.#type,
            session_id: this.#session_id,
            timestamp: this.#timestamp,
        };
        return this;
    }

    setType(type) {
        if (!Object.values(ConsensusOperationType).includes(type) || type === ConsensusOperationType.UNSPECIFIED) {
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

    setNetworkId(networkId) {
        const value = uint16ToBuffer(networkId);
        if (networkId === 0) {
            throw new Error('Network id must be greater than zero.');
        }

        this.#network_id = value;
        return this;
    }

    setEpoch(epoch) {
        const value = uint64ToBuffer(epoch);
        const epochValue = typeof epoch === 'bigint' ? epoch : BigInt(epoch);
        if (epochValue === 0n) {
            throw new Error('Epoch must be greater than zero.');
        }

        this.#epoch = value;
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

    setDifficulty(difficulty) {
        this.#difficulty = this.#validateBuffer(difficulty, 'Difficulty');
        return this;

    }

    setDiscriminantBitSize(discriminantBitSize) {
        this.#discriminant_bit_size = this.#validateBuffer(discriminantBitSize, 'Discriminant bit size');
        return this;
    }

    setProof(proof) {
        this.#proof = this.#validateBuffer(proof, 'Proof');
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

    #buildUnsignedProofProposal() {
        return {
            network_id: this.#validateBuffer(this.#network_id, 'Network id'),
            epoch: this.#validateBuffer(this.#epoch, 'Epoch'),
            previous_epoch_record_hash: this.#validateBuffer(this.#previous_epoch_record_hash, 'Previous epoch record hash'),
            proposer: this.#validateBuffer(this.#proposer, 'Proposer'),
            difficulty: this.#validateBuffer(this.#difficulty, 'Difficulty'),
            discriminant_bit_size: this.#validateBuffer(this.#discriminant_bit_size, 'Discriminant bit size'),
            proof: this.#validateBuffer(this.#proof, 'Proof')
        };
    }

    #getResultCode() {
        if (this.#resultCode === undefined) {
            throw new Error('Result code must be set before build.');
        }

        return this.#resultCode;
    }

    #getApprover() {
        return this.#validateBuffer(this.#approver, 'Approver');
    }

    #getRequesterProofSignature() {
        return this.#validateBuffer(
            this.#requester_proof_signature,
            'Requester proof signature'
        );
    }

    async #hashProofProposal(proofProposal) {
        return await tracCryptoApi.hash.blake3(createMessage(
            uint8ToBuffer(ConsensusProtocolVersion.V1),
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size,
            proofProposal.proof
        ));
    }

    async #hashProofProposalApproval(proofProposal, approver, requesterProofSignature) {
        return await tracCryptoApi.hash.blake3(createMessage(
            uint8ToBuffer(ConsensusProtocolVersion.V1),
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size,
            proofProposal.proof,
            approver,
            requesterProofSignature
        ));
    }

    async #hashProofProposalResponse(resultCode, proofProposalApproval) {
        const resultCodeBuffer = uint32ToBuffer(resultCode);
        const message = proofProposalApproval
            ? createMessage(resultCodeBuffer, encodeProofProposalApproval(proofProposalApproval))
            : createMessage(resultCodeBuffer);

        return await tracCryptoApi.hash.blake3(message);
    }

    async #signProofProposal(proofProposal) {
        return this.#wallet.sign(await this.#hashProofProposal(proofProposal));
    }

    async #buildProofProposalApproval(proofProposal, approver, requesterProofSignature) {
        const hashApproval = await this.#hashProofProposalApproval(
            proofProposal,
            approver,
            requesterProofSignature
        );

        return {
            approver,
            approval_sig: this.#wallet.sign(hashApproval),
        };
    }

    async #signProofProposalResponse(resultCode, proofProposalApproval) {
        return this.#wallet.sign(
            await this.#hashProofProposalResponse(resultCode, proofProposalApproval)
        );
    }

    #setPayload(payloadKey, body) {
        this.#payloadKey = payloadKey;
        this.#body = body;
    }

    async #buildProofProposalPayload() {
        const proofProposal = this.#buildUnsignedProofProposal();
        const signature = await this.#signProofProposal(proofProposal);
        this.#setPayload('proof_proposal', {
            ...proofProposal,
            signature: signature,
        });
    }

    async #buildProofProposalResponsePayload() {
        const resultCode = this.#getResultCode();
        let proofProposalApproval = null;

        if (resultCode === ConsensusResultCode.OK) {
            const proofProposal = this.#buildUnsignedProofProposal();
            const approver = this.#getApprover();
            const requesterProofSignature = this.#getRequesterProofSignature();
            proofProposalApproval = await this.#buildProofProposalApproval(
                proofProposal,
                approver,
                requesterProofSignature
            );
        }

        const responseSig = await this.#signProofProposalResponse(resultCode, proofProposalApproval);

        const response = {
            result: resultCode,
            response_sig: responseSig,
        };

        if (proofProposalApproval) {
            response.approval = proofProposalApproval;
        }

        this.#setPayload('proof_proposal_response', response);
    }

    async buildPayload() {
        this.#setHeader();

        switch (this.#type) {
            case ConsensusOperationType.PROOF_PROPOSAL: {
                await this.#buildProofProposalPayload();
                break;
            }
            case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL: {
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
