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
    _config;
    _state;
    /**
     * Creates the base validator shared by consensus v1 operations.
     *
     * Initializes operation schemas and stores the shared dependencies used by
     * address, signature, and state-backed validation.
     *
     * @param {Config} config Application configuration. The base validator uses
     * `addressLength` for schemas and `addressPrefix` for address conversion.
     * @param {State} state Ledger state. It must expose `isIndexerAddress(address)`
     * for indexer membership validation.
     * @throws {Error} When consensus schemas cannot be initialized from the configuration.
     */
    constructor(config, state) {
        this.#consensusValidationSchema = new ConsensusValidationSchema(config);
        this._config = config;
        this._state = state;
    }

    /**
     * Runs a validator behind the consensus protocol error boundary.
     *
     * Expected protocol errors keep their result code and identity. Unexpected
     * errors from state, codecs, crypto APIs, or malformed runtime values are
     * exposed as a stable protocol error while remaining available as `cause`.
     * Validation operations are expected to throw `Error` instances.
     *
     * @param {function(): (Promise<*>|*)} validation Validation operation to execute.
     * @returns {Promise<*>} Result returned by the validation operation.
     * @throws {V1ConsensusProtocolError} Re-throws protocol errors or wraps unexpected failures.
     */
    async validateAsProtocolError(validation) {
        try {
            return await validation();
        } catch (error) {
            if (error instanceof V1ConsensusProtocolError) {
                throw error;
            }

            const protocolError = new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                error.message
            );
            protocolError.cause = error;
            throw protocolError;
        }
    }

    /**
     * Validates the payload against the schema selected by its operation type.
     *
     * Checks that the operation type is present, supported, and that all fields
     * required by the corresponding request or approval schema are valid.
     *
     * @param {object} payload Decoded consensus operation payload.
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When the type or payload schema is invalid.
     */
    isPayloadSchemaValid(payload) {
        if (_.isNil(payload?.type)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.INVALID_PAYLOAD,
                'Payload or payload type is missing.'
            );
        }

        const selectedValidator = this.#selectCheckSchemaValidator(payload.type);
        const isPayloadValid = selectedValidator(payload);
        if (!isPayloadValid) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.SCHEMA_VALIDATION_FAILED,
                'Payload is invalid.'
            );
        }
    }

    /**
     * Builds canonical VDF challenge data from proof proposal fields 1 through 6.
     *
     * The message contains protocol version, network id, epoch, previous epoch
     * record hash, proposer address, and VDF parameters hash in protocol order.
     *
     * @param {object} proofProposal Decoded proof proposal.
     * @returns {Buffer} Canonically encoded challenge data.
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
     *
     * @param {number} type Consensus operation type.
     * @returns {function(object): boolean} Bound schema validation function.
     * @throws {V1ConsensusProtocolError} When the operation type is not an integer or is unsupported.
     */
    #selectCheckSchemaValidator(type) {
        if (!Number.isInteger(type)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.OPERATION_TYPE_INVALID,
                'Operation type must be an integer.'
            );
        }

        switch (type) {
            case ConsensusOperationType.UNSPECIFIED:
                throw new V1ConsensusProtocolError(
                    ConsensusResultCode.OPERATION_TYPE_INVALID,
                    'Operation type is unspecified.'
                );
            case ConsensusOperationType.PROOF_PROPOSAL:
                return this.#consensusValidationSchema.validateConsensusV1ProofProposal.bind(this.#consensusValidationSchema);
            case ConsensusOperationType.PROOF_PROPOSAL_APPROVAL:
                return this.#consensusValidationSchema.validateV1EpochProofProposalResponse.bind(this.#consensusValidationSchema);
            default:
                throw new V1ConsensusProtocolError(
                    ConsensusResultCode.OPERATION_TYPE_INVALID,
                    `Unknown operation type: ${type}`
                );
        }
    }

    /**
     * Verifies the operation signature against the remote peer public key.
     *
     * Builds the canonical request or approval signature message, hashes it with
     * BLAKE3, and verifies the signature using the supplied public key.
     *
     * @param {object} payload Decoded proof proposal request or approval payload.
     * @param {Buffer} remotePublicKey Public key received from the peer connection.
     * @param {object} [proofProposal] Original proof proposal required for approval verification.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When message construction, hashing, or signature verification fails.
     */
    async validateSignature(
        payload,
        remotePublicKey,
        proofProposal,
        invalidSignatureResultCode = ConsensusResultCode.UNEXPECTED_ERROR
    ) {
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
                invalidSignatureResultCode,
                'signature verification failed.'
            );
        }
    }

    /**
     * Builds the canonical signature message for the internal consensus operation.
     *
     * A proposal message covers the VDF challenge and proof. An approval message
     * additionally covers the approver and the original proposal signature.
     *
     * @param {object} payload Decoded consensus operation payload.
     * @param {object} [proofProposalContext] Original proposal used for an approval message.
     * @returns {{signature: Buffer, message: Buffer}} Signature and canonical message to verify.
     * @throws {V1ConsensusProtocolError} When the operation type is invalid or unsupported.
     */
    #buildSignatureMessage(payload, proofProposalContext) {
        if (!Number.isInteger(payload.type)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.OPERATION_TYPE_INVALID,
                'Operation type must be an integer.'
            );
        }

        switch (payload.type) {
            case ConsensusOperationType.UNSPECIFIED:
                throw new V1ConsensusProtocolError(
                    ConsensusResultCode.OPERATION_TYPE_INVALID,
                    'Operation type is unspecified.'
                );
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
                    ConsensusResultCode.OPERATION_TYPE_INVALID,
                    `Unknown operation type: ${payload.type}`
                );
        }
    }

    /**
     * Validates that a binary protocol address belongs to the connected peer.
     *
     * Converts the binary address to its configured textual representation,
     * decodes its public key, and compares it with the remote connection key.
     *
     * @param {Buffer} binaryAddress Binary proposer or approver address from the payload.
     * @param {Buffer} remotePublicKey Public key received from the peer connection.
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When the address is invalid or belongs to another key.
     */
    assertAddressWithRemotePublicKey(binaryAddress, remotePublicKey) {
        const address = bufferToAddress(binaryAddress, this._config.addressPrefix);
        if (!address) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.ADDRESS_INVALID,
                'Address is invalid.'
            );
        }
        let publicKeyFromAddress;
        try {
            publicKeyFromAddress = tracCryptoApi.address.decode(address);
        } catch {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.ADDRESS_INVALID,
                'Address is invalid.'
            );
        }

        if (!remotePublicKey) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Remote public key is missing.'
            );
        }

        if (!b4a.equals(publicKeyFromAddress, remotePublicKey)) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.PUBLIC_KEY_MISMATCH,
                'Address does not match remote public key.'
            );
        }
    }

    /**
     * Validates that the connected peer is registered as an indexer in state.
     *
     * Encodes the remote public key as a configured network address and checks
     * that address against the current indexer set.
     *
     * @param {Buffer} remotePublicKey Public key received from the peer connection.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When the remote address is not an indexer.
     */
    async validateAddressIsIndexer(remotePublicKey) {
        // TODO: In the future, we should handle this specific error to not only drop the connection
        // but also blacklist the specific node.
        // Such an error would mean that someone is trying to impersonate an indexer.
        const address = tracCryptoApi.address.encode(this._config.addressPrefix, remotePublicKey);
        const isIndexer = await this._state.isIndexerAddress(address);
        if (!isIndexer) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.INDEXER_ROLE_INVALID,
                'Incoming address is not an indexer.'
            )
        }
    }

    /**
     * Validates that this node is still an indexer before it acts on an indexer-only
     * operation (e.g. signing a proposal approval). A node that lost its indexer role
     * must not approve or sign anything on the indexer's behalf.
     *
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When the local node is not an indexer.
     */
    validateLocalNodeIsIndexer() {
        if (!this._state.isIndexer()) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.INDEXER_ROLE_INVALID,
                'Local node is not an indexer and cannot approve proposals.'
            )
        }
    }
}


export default V1BaseConsensusOperation;
