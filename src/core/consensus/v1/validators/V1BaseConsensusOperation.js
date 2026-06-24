import ConsensusValidationSchema from "./ConsensusValidationSchema.js";
import _ from "lodash";

import {
    ConsensusOperationType,
    ConsensusResultCode
} from "../../../../utils/constants.js";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";
import tracCryptoApi from "trac-crypto-api";
import {createMessage} from "../../../../utils/buffer.js";
import {bufferToAddress} from "../../../state/utils/address.js";
import b4a from "b4a";

class V1BaseConsensusOperation {
    #consensusValidationSchema;
    #config;
    /**
     * Creates the base consensus validator with schema validation support.
     */
    constructor(config) {
        this.#consensusValidationSchema = new ConsensusValidationSchema(config);
        this.#config = config;
    }

    /**
     * Validates the consensus payload shape for its declared operation type.
     */
    isPayloadSchemaValid(payload) {
        if (_.isNil(payload?.type)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Payload or payload type is missing.'
            );
        }

        const selectedValidator = this.#selectCheckSchemaValidator(payload.type);
        const isPayloadValid = selectedValidator(payload);
        if (!isPayloadValid) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Payload is invalid.'
            );
        }
    }

    /**
     * Builds proof proposal challenge data from fields 1 through 6.
     */
    buildProofProposalChallengeData(proofProposal) {
        return createMessage(
            proofProposal.protocol_version,
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.vdf_parameters_hash
        );
    }

    /**
     * Selects the schema validator for the consensus operation type.
     */
    #selectCheckSchemaValidator(type) {
        if (!Number.isInteger(type)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Operation type must be an integer.'
            );
        }
        if (type === 0) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Operation type is unspecified.'
            );
        }

        switch (type) {
            case ConsensusOperationType.PROOF_PROPOSAL:
                return this.#consensusValidationSchema.validateConsensusV1ProofProposal.bind(this.#consensusValidationSchema);
            case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL:
                return this.#consensusValidationSchema.validateV1EpochProofProposalResponse.bind(this.#consensusValidationSchema);
            default:
                throw new V1ConsensusProtocolError(
                    ConsensusResultCode.UNEXPECTED_ERROR,
                    `Unknown operation type: ${type}`
                );
        }
    }

    /**
     * Builds and verifies the operation signature against the remote public key.
     */
    async validateSignature(payload, remotePublicKey, proofProposal) {
        let signature;
        let message;
        try {
            const result = this.#buildSignatureMessage(payload, proofProposal);
            signature = result.signature;
            message = result.message;
        } catch (error) {
            if (error instanceof V1ConsensusProtocolError) {
                throw error;
            }
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                `Failed to build signature message: ${error.message}`
            );
        }

        if (!remotePublicKey) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Remote public key is missing.'
            );
        }

        let hash;
        try {
            hash = await tracCryptoApi.hash.blake3(message);
        } catch {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Failed to hash signature message.'
            );
        }

        let verified = false;
        try {
            verified = tracCryptoApi.signature.verify(signature, hash, remotePublicKey);
        } catch {
            verified = false;
        }
        if (!verified) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'signature verification failed.'
            );
        }
    }

    /**
     * Builds the canonical signature message for the internal consensus operation.
     */
    #buildSignatureMessage(payload, proofProposalContext) {
        if (!Number.isInteger(payload.type)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Operation type must be an integer.'
            );
        }
        if (payload.type === 0) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Operation type is unspecified.'
            );
        }

        switch (payload.type) {
            case ConsensusOperationType.PROOF_PROPOSAL: {
                const proofProposal = payload.proof_proposal;
                const challengeData = this.buildProofProposalChallengeData(proofProposal);
                const message = createMessage(challengeData, proofProposal.vdf_proof);

                return {signature: proofProposal.signature, message};
            }
            case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL: {
                const proofProposal = proofProposalContext;
                const approval = payload.proof_proposal_response.approval;
                const challengeData = this.buildProofProposalChallengeData(proofProposal);

                const message = createMessage(
                    challengeData,
                    proofProposal.vdf_proof,
                    approval.approver,
                    proofProposal.signature
                );

                return {signature: approval.approval_sig, message};
            }
            default:
                throw new V1ConsensusProtocolError(
                    ConsensusResultCode.UNEXPECTED_ERROR,
                    `Unknown operation type: ${payload.type}`
                );
        }
    }

    /**
     * Validates that the payload address resolves to the remote public key.
     */
    assertAddressWithRemotePublicKey(binaryAddress, remotePublicKey, context) {
        const address = bufferToAddress(binaryAddress, this.#config.addressPrefix);
        if (!address) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                `${context} address is invalid.`
            );
        }
        const publicKeyFromAddress = tracCryptoApi.address.decode(address);
        if (!b4a.equals(publicKeyFromAddress, remotePublicKey)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                `${context} address does not match remote public key.`
            );
        }
    }

    validateAddressIsIndexer() {
        //TODO: Placeholder - payload address should have the indexer role in state. Completion depends on genesis being initialized in the ledger. this is not implemented yet.
    }

}


export default V1BaseConsensusOperation;
