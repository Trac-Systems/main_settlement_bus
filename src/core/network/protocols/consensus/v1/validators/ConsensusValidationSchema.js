import Validator from 'fastest-validator';
import {
    HASH_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
    CONSENSUS_REQUEST_ID_MAX_LENGTH,
    CONSENSUS_SESSION_ID_MAX_LENGTH,
    ConsensusOperationType,
    SIGNATURE_BYTE_LENGTH,
    ConsensusResultCode,
    NETWORK_ID_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE
} from '../../../../../../utils/constants.js';
import { EPOCH_APPENDER_SELECTION_VERSION, EpochAppenderVoteStatus } from '../../../../../consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import {
    compileBufferRule,
    validateSelectionCounter,
    validateProofProposalLength,
    validateProofProposalApprovalPresence,
} from './consensusValidationSchemaHelpers.js';

const ALLOWED_RESULT_CODES = Object.values(ConsensusResultCode);

class ConsensusValidationSchema {
    #config;
    #validator;
    #validateConsensusV1ProofProposalSchema;
    #validateConsensusV1ProposalApprovalSchema;
    #validateEpochAppendRequestSchema;
    #validateEpochAppendReplySchema;
    #epochAppendIntentSchema;

    constructor(config) {
        this.#config = config;
        this.#validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                bufferMinLength: "The '{field}' field must be a Buffer with min length {expected}! Actual: {actual}",
                bufferMaxLength: "The '{field}' field must be a Buffer with max length {expected}! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
                emptyBuffer: "The '{field}' field must not be an empty Buffer! Actual: {actual}",
                uint64: "The '{field}' field must be an unsigned 64-bit integer! Actual: {actual}",
            },
        });
        this.#validator.add('buffer', compileBufferRule);
        this.#epochAppendIntentSchema = {
            type: 'object',
            strict: true,
            props: {
                network_id: { type: 'buffer', length: NETWORK_ID_BYTE_LENGTH, required: true },
                bootstrap: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true },
                epoch: { type: 'buffer', length: EPOCH_BYTE_LENGTH, required: true },
                parent_hash: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true },
                membership_context: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true },
                config_hash: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true },
                request_id: { type: 'string', min: 1, max: CONSENSUS_REQUEST_ID_MAX_LENGTH, required: true },
                payload_hash: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true },
                logical_counter: { type: 'buffer', length: EPOCH_BYTE_LENGTH, required: true, custom: validateSelectionCounter },
                requester: { type: 'buffer', length: PUBLIC_KEY_LENGTH, required: true },
                selection_version: { type: 'equal', value: EPOCH_APPENDER_SELECTION_VERSION, required: true },
            },
        };
        this.#validateConsensusV1ProofProposalSchema = this.#compileV1EpochProofProposalRequestSchema();
        this.#validateConsensusV1ProposalApprovalSchema = this.#compileConsensusV1ProposalApprovalSchema();
        this.#validateEpochAppendRequestSchema = this.#compileEpochAppendRequestSchema();
        this.#validateEpochAppendReplySchema = this.#compileEpochAppendReplySchema();
    }

    #compileV1EpochProofProposalRequestSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                integer: true,
                equal: ConsensusOperationType.PROOF_PROPOSAL,
                required: true
            },
            session_id: { type: 'string', min: 1, max: CONSENSUS_SESSION_ID_MAX_LENGTH, required: true },
            timestamp: { type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true },
            proof_proposal: {
                strict: true,
                type: 'object',
                props: {
                    network_id: { type: 'buffer', length: NETWORK_ID_BYTE_LENGTH, required: true },
                    epoch: { type: 'buffer', length: EPOCH_BYTE_LENGTH, required: true },
                    previous_epoch_record_hash: { type: 'buffer', length: HASH_BYTE_LENGTH, required: true },
                    proposer: { type: 'buffer', length: this.#config.addressLength, required: true },
                    difficulty: { type: 'buffer', length: VDF_DIFFICULTY_SIZE, required: true },
                    discriminant_bit_size: { type: 'buffer', length: VDF_DISCRIMINANT_SIZE, required: true },
                    proof: { type: 'buffer', required: true },
                    signature: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                },
                custom: validateProofProposalLength,
            },
        };
        return this.#validator.compile(schema);
    }

    validateConsensusV1ProofProposal(operation) {
        return this.#validateConsensusV1ProofProposalSchema(operation) === true;
    }

    #compileConsensusV1ProposalApprovalSchema() {
        const schema = {
            $$strict: true,
            type: {
                type: 'number',
                integer: true,
                equal: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL,
                required: true
            },
            session_id: { type: 'string', min: 1, max: CONSENSUS_SESSION_ID_MAX_LENGTH, required: true },
            timestamp: { type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true },
            proof_proposal_response: {
                strict: true,
                type: 'object',
                props: {
                    result: { type: 'enum', values: ALLOWED_RESULT_CODES, required: true },
                    approval: {
                        strict: true,
                        type: 'object',
                        optional: true,
                        props: {
                            approver: { type: 'buffer', length: this.#config.addressLength, required: true },
                            approval_sig: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                        }
                    },
                    response_sig: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                },
                custom: validateProofProposalApprovalPresence,
            },
        };
        return this.#validator.compile(schema);
    }

    validateV1EpochProofProposalResponse(operation) {
        return this.#validateConsensusV1ProposalApprovalSchema(operation) === true;
    }

    #compileEpochAppendRequestSchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', integer: true, equal: ConsensusOperationType.REQUEST, required: true },
            session_id: { type: 'string', min: 1, max: CONSENSUS_SESSION_ID_MAX_LENGTH, required: true },
            timestamp: { type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true },
            request: {
                type: 'object',
                strict: true,
                props: {
                    intent: this.#epochAppendIntentSchema,
                    signature: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                },
            },
        };
        return this.#validator.compile(schema);
    }

    validateEpochAppendRequest(operation) {
        return this.#validateEpochAppendRequestSchema(operation) === true;
    }

    #compileEpochAppendReplySchema() {
        const schema = {
            $$strict: true,
            type: { type: 'number', integer: true, equal: ConsensusOperationType.REPLY, required: true },
            session_id: { type: 'string', min: 1, max: CONSENSUS_SESSION_ID_MAX_LENGTH, required: true },
            timestamp: { type: 'number', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER, required: true },
            reply: {
                type: 'object',
                strict: true,
                props: {
                    intent: this.#epochAppendIntentSchema,
                    signature: { type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true },
                    responder: { type: 'buffer', length: PUBLIC_KEY_LENGTH, required: true },
                    vote_status: { type: 'enum', values: Object.values(EpochAppenderVoteStatus), required: true },
                    observed_counter: { type: 'buffer', length: EPOCH_BYTE_LENGTH, required: true, custom: validateSelectionCounter },
                    vote: this.#epochAppendIntentSchema,
                },
            },
        };
        return this.#validator.compile(schema);
    }

    validateEpochAppendReply(operation) {
        return this.#validateEpochAppendReplySchema(operation) === true;
    }
}

export default ConsensusValidationSchema;
