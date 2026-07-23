import V1BaseConsensusOperation from "./V1BaseConsensusOperation.js";
import {ConsensusResultCode} from "../../../../utils/constants.js";
import {createMessage , uint32ToBuffer} from "../../../../utils/buffer.js";
import {encodeProofProposalApproval} from "../../../../codecs/consensus/v1/consensusV1OperationCodec.js";
import tracCryptoApi from "trac-crypto-api";
import {V1ConsensusProtocolError} from "../V1ConsensusProtocolError.js";

class V1EpochProofProposalApproval extends V1BaseConsensusOperation {
    /**
     * Creates the proof proposal approval validator.
     *
     * @param {Config} config Application configuration. Approval validation uses
     * `addressLength` for schemas and `addressPrefix` for approver addresses.
     * @param {State} state Ledger state. It must expose
     * `isIndexerAddress(address)` for approver membership validation.
     * @throws {Error} When consensus schemas cannot be initialized from the configuration.
     */
    constructor(config, state) {
        super(config, state);
    }

    /**
     * Validates a complete incoming proof proposal approval.
     *
     * Checks the response schema and signature, requires an OK result, verifies
     * that the approver belongs to the remote public key, verifies the approval
     * signature against the original proposal, and checks indexer membership.
     *
     * @param {object} payload Decoded proof proposal approval payload.
     * @param {object} connection Peer connection containing `remotePublicKey`.
     * @param {object} proofProposal Original proof proposal being approved.
     * @returns {Promise<boolean>} Resolves to `true` when every check succeeds.
     * @throws {V1ConsensusProtocolError} When any approval validation check fails.
     */
    async validate(payload, connection, proofProposal) {
        return await this.validateAsProtocolError(async () => {
            this.isPayloadSchemaValid(payload);

            await this.#validateResponseSignature(payload, connection.remotePublicKey);
            const resultCode = payload.proof_proposal_response.result;
            this.#validateIfResultCodeIsOk(resultCode);
            const approval = payload.proof_proposal_response.approval;
            this.assertAddressWithRemotePublicKey(
                approval.approver,
                connection.remotePublicKey
            );
            await this.validateSignature(payload, connection.remotePublicKey, proofProposal, ConsensusResultCode.APPROVAL_SIGNATURE_INVALID);
            await this.validateAddressIsIndexer(connection.remotePublicKey);
            return true;
        });
    }

    /**
     * Verifies the response signature over result code and optional encoded approval.
     *
     * For an OK response the signed message covers both result code and encoded
     * approval. For a rejection it covers only the result code.
     *
     * @param {object} payload Decoded proof proposal response payload.
     * @param {Buffer} remotePublicKey Public key received from the peer connection.
     * @returns {Promise<void>}
     * @throws {V1ConsensusProtocolError} When hashing or response signature verification fails.
     */
    async #validateResponseSignature(payload, remotePublicKey) {
        const proofProposalResponse = payload.proof_proposal_response;
        const resultCode = uint32ToBuffer(proofProposalResponse.result);
        const message = proofProposalResponse.result === ConsensusResultCode.OK
            ? createMessage(resultCode, encodeProofProposalApproval(proofProposalResponse.approval))
            : createMessage(resultCode);

        let hash;
        try {
            hash = await tracCryptoApi.hash.blake3(message);
        } catch {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Failed to hash response signature message.'
            );
        }

        if (!remotePublicKey) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.UNEXPECTED_ERROR,
                'Remote public key is missing.'
            );
        }

        let verified;
        try {
            verified = tracCryptoApi.signature.verify(
                proofProposalResponse.response_sig,
                hash,
                remotePublicKey
            );
        } catch {
            verified = false;
        }
        if (!verified) {
            throw new V1ConsensusProtocolError(
                ConsensusResultCode.RESPONSE_SIGNATURE_INVALID,
                'response signature verification failed.'
            );
        }
    }

    /**
     * Validates that the proof proposal response accepts the proposal.
     *
     * @param {number} resultCode Consensus result code from the response.
     * @returns {void}
     * @throws {V1ConsensusProtocolError} When the response result is not `ConsensusResultCode.OK`.
     */
    #validateIfResultCodeIsOk(resultCode) {
        if (resultCode !== ConsensusResultCode.OK) {
            throw new V1ConsensusProtocolError(resultCode, `Proof proposal response result code is not OK: ${resultCode}`);
        }
    }

}

export default V1EpochProofProposalApproval;
