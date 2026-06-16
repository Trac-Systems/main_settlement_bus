import ConsensusValidationSchema from './ConsensusValidationSchema.js';
import { ConsensusOperationType, ResultCode } from '../../../../utils/constants.js';
import { V1ProtocolError } from '../../../network/protocols/v1/V1ProtocolError.js';
import tracCryptoApi from 'trac-crypto-api';
import b4a from 'b4a';
import { createMessage } from '../../../../utils/buffer.js';

class ConsensusBaseOperation {
    #consensusValidationSchema;

    constructor(config) {
        this.#consensusValidationSchema = new ConsensusValidationSchema(config);
    }

    async validate(_payload, _connection, _pendingRequestServiceEntry) {
        throw new Error("Method 'validate()' must be implemented.");
    }

    isPayloadSchemaValid(payload) {
        if (payload?.type == null) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Payload or payload type is missing.');
        }
        const validator = this.#selectSchemaValidator(payload.type);
        const isValid = validator(payload);
        if (!isValid) {
            throw new V1ProtocolError(ResultCode.INVALID_PAYLOAD, 'Payload is invalid.');
        }
    }

    async validateSignature(payload, remotePublicKey) {
        const proposal = payload.proof_proposal;
        const hash = await tracCryptoApi.hash.blake3(createMessage(
            proposal.protocol_version,
            proposal.network_id,
            proposal.epoch,
            proposal.previous_epoch_record_hash,
            proposal.proposer,
            proposal.vdf_parameters_hash,
            proposal.vdf_proof
        ));
        let verified = false;
        try {
            verified = tracCryptoApi.signature.verify(proposal.signature, hash, remotePublicKey);
        } catch {
            verified = false;
        }
        if (!verified) {
            throw new V1ProtocolError(ResultCode.SIGNATURE_INVALID, 'Signature verification failed.');
        }
    }

    validatePeerCorrectness(remotePublicKey, pendingRequestServiceEntry) {
        const senderHex = b4a.toString(remotePublicKey, 'hex');
        if (senderHex !== pendingRequestServiceEntry.requestedTo) {
            throw new V1ProtocolError(
                ResultCode.INVALID_PAYLOAD,
                `Response sender mismatch. Expected ${pendingRequestServiceEntry.requestedTo}, got ${senderHex}.`
            );
        }
    }

    validateResponseType(payload, pendingRequestServiceEntry) {
        switch (pendingRequestServiceEntry.requestType) {
            case ConsensusOperationType.PROOF_PROPOSAL: {
                const expected = ConsensusOperationType.PROOF_PROPOSAL_RESPONSE;
                if (payload.type !== expected) {
                    throw new V1ProtocolError(
                        ResultCode.INVALID_PAYLOAD,
                        `Response type mismatch. Expected ${expected}, got ${payload.type}.`
                    );
                }
                break;
            }
            default:
                throw new V1ProtocolError(
                    ResultCode.UNEXPECTED_ERROR,
                    `Unsupported pending request type: ${pendingRequestServiceEntry.requestType}.`
                );
        }
    }

    #selectSchemaValidator(type) {
        switch (type) {
            case ConsensusOperationType.PROOF_PROPOSAL:
                return this.#consensusValidationSchema.validateConsensusV1ProofProposal.bind(this.#consensusValidationSchema);
            case ConsensusOperationType.PROOF_PROPOSAL_RESPONSE:
                return this.#consensusValidationSchema.validateV1EpochProofProposalResponse.bind(this.#consensusValidationSchema);
            default:
                throw new V1ProtocolError(ResultCode.UNEXPECTED_ERROR, `Unknown consensus operation type: ${type}`);
        }
    }
}

export default ConsensusBaseOperation;
