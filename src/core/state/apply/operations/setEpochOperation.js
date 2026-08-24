import BaseHandler from './BaseHandler.js';
import b4a from 'b4a';
import {
    EntryType,
    OperationType,
    CustomEventType,
    ConsensusConfigSchemaVersion,
    ConsensusProtocolVersion,
} from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { verifyWesolowski } from '@tracsystems/trac-vdf';
import {
    decodeConsensusConfig,
    safeEncodeEpochProof
} from '../../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    NULL_BUFFER,
    safeReadUint32BE,
    safeReadUint8,
    uint16ToBuffer
} from '../../../../utils/buffer.js';
import { safeDecodeProofProposal, safeDecodeProofProposalApproval } from '../../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import addressUtils from '../../utils/address.js';
import {
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
    safeDecodeVdfConfig,
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class SetEpochHandler extends BaseHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema, state, logger) {
        super(logger, state);
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    canHandle(operation) {
        return operation.type === OperationType.SET_EPOCH;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateSetEpochOperation(op)) {
            this.logger.error(OperationType.SET_EPOCH, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        const proofProposal = safeDecodeProofProposal(op.seo.pd);
        if (proofProposal === null) {
            this.logger.error(OperationType.SET_EPOCH, "Failed to decode proof proposal.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpochBuffer = await this.#repo.getEntry(EntryType.EPOCH_CURRENT, batch);
        if (currentEpochBuffer === null) {
            this.logger.error(OperationType.SET_EPOCH, "Current epoch is not initialized. Genesis epoch has not been set.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpoch = currentEpochBuffer.readBigUInt64BE(0);
        const nextEpoch = currentEpoch + 1n;
        const proposedEpoch = proofProposal.epoch.readBigUInt64BE(0);

        if (proposedEpoch < nextEpoch) {
            this.logger.error(OperationType.SET_EPOCH, `Stale epoch proposal. Epoch ${currentEpoch} is already committed.`, node.from.key)
            return Status.IGNORE;
        }

        if (proposedEpoch > nextEpoch) {
            this.logger.error(OperationType.SET_EPOCH, `Unexpected epoch. Proposal must target epoch ${nextEpoch} but got ${proposedEpoch}.`, node.from.key)
            return Status.FAILURE;
        }

        if (proofProposal.protocol_version[0] !== ConsensusProtocolVersion.V1) {
            this.logger.error(OperationType.SET_EPOCH, "Unsupported proof proposal protocol version.", node.from.key)
            return Status.FAILURE;
        }

        const expectedNetworkId = uint16ToBuffer(this.#config.networkId);
        if (!b4a.equals(proofProposal.network_id, expectedNetworkId)) {
            this.logger.error(OperationType.SET_EPOCH, "Invalid proof proposal network id.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpochHash = await this.#repo.getEntry(EntryType.EPOCH + currentEpoch.toString(), batch);
        if (currentEpochHash === null || !b4a.equals(currentEpochHash, proofProposal.previous_epoch_record_hash)) {
            this.logger.error(OperationType.SET_EPOCH, `Previous epoch record hash mismatch for epoch ${currentEpoch}.`, node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigBuffer = await this.#repo.getEntry(EntryType.CONSENSUS_CONFIG_CURRENT, batch);
        if (currentConsensusConfigBuffer === null) {
            this.logger.error(OperationType.SET_EPOCH, "Consensus config is not initialized.", node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigIndex = safeReadUint32BE(currentConsensusConfigBuffer);
        if (currentConsensusConfigIndex === null) {
            this.logger.error(OperationType.SET_EPOCH, "Failed to read current consensus config index from buffer", node.from.key)
            return Status.FAILURE;
        }

        const consensusConfigBuffer = await this.#repo.getEntry(
            EntryType.CONSENSUS_CONFIG_RECORD + currentConsensusConfigIndex,
            batch
        );
        if (consensusConfigBuffer === null) {
            this.logger.error(OperationType.SET_EPOCH, "Consensus config record does not exist.", node.from.key)
            return Status.FAILURE;
        }

        const consensusConfig = decodeConsensusConfig(consensusConfigBuffer);
        const schemaVersion = safeReadUint8(consensusConfig.sv);
        if (schemaVersion !== ConsensusConfigSchemaVersion.VDF_V1) {
            this.logger.error(OperationType.SET_EPOCH, "Unsupported consensus config schema version.", node.from.key)
            return Status.FAILURE;
        }

        const decodedVdfParams = safeDecodeVdfConfig(consensusConfig.cd);
        if (decodedVdfParams === null) {
            this.logger.error(OperationType.SET_EPOCH, "Invalid VDF params value.", node.from.key)
            return Status.FAILURE;
        }

        const { difficulty, discriminantBitSize } = decodedVdfParams;
        if (
            !b4a.equals(difficulty, proofProposal.difficulty) ||
            !b4a.equals(discriminantBitSize, proofProposal.discriminant_bit_size)
        ) {
            this.logger.error(OperationType.SET_EPOCH, "VDF parameters do not match the current consensus config.", node.from.key)
            return Status.FAILURE;
        }

        const challengeData = createMessage(
            proofProposal.protocol_version,
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size
        );

        let vdfProofVerified = false;
        try {
            //TODO: Implement safe version
            vdfProofVerified = await verifyWesolowski(
                challengeData,
                difficulty.readUInt32BE(0),
                proofProposal.proof,
                discriminantBitSize.readUInt16BE(0)
            );
        } catch (error) {
            console.error(error);
        }
        if (!vdfProofVerified) {
            this.logger.error(OperationType.SET_EPOCH, "VDF proof is invalid.", node.from.key)
            return Status.FAILURE;
        }

        const indexerAddresses = new Set();
        for (const indexer of Object.values(base.system.indexers)) {
            const indexerAddressBuffer = await this.#repo.getRegisteredWriterKey(batch, indexer.key.toString('hex'));
            if (!indexerAddressBuffer) continue;
            const indexerAddress = addressUtils.bufferToAddress(indexerAddressBuffer, this.#config.addressPrefix);
            if (indexerAddress) indexerAddresses.add(indexerAddress);
        }

        const proposerAddress = addressUtils.bufferToAddress(proofProposal.proposer, this.#config.addressPrefix);
        if (!proposerAddress || !indexerAddresses.has(proposerAddress)) {
            this.logger.error(OperationType.SET_EPOCH, "Proposer is not a registered indexer.", node.from.key)
            return Status.FAILURE;
        }

        const proposerPublicKey = tracCryptoApi.address.decodeSafe(proposerAddress);
        let proposalSignatureVerified = false;
        if (!b4a.equals(proposerPublicKey, NULL_BUFFER)) {
            const proposalMessage = createMessage(challengeData, proofProposal.proof);
            try {
                const proposalHash = await tracCryptoApi.hash.blake3(proposalMessage);
                proposalSignatureVerified = tracCryptoApi.signature.verify(proofProposal.signature, proposalHash, proposerPublicKey);
            } catch {
                proposalSignatureVerified = false;
            }
        }
        if (!proposalSignatureVerified) {
            this.logger.error(OperationType.SET_EPOCH, "Failed to verify proof proposal signature.", node.from.key)
            return Status.FAILURE;
        }

        const validApprovers = new Set();
        for (const encodedApproval of op.seo.app) {
            const approval = safeDecodeProofProposalApproval(encodedApproval);
            if (approval === null) continue;

            const approverAddress = addressUtils.bufferToAddress(approval.approver, this.#config.addressPrefix);
            if (!approverAddress || approverAddress === proposerAddress || !indexerAddresses.has(approverAddress)) continue;

            const approverPublicKey = tracCryptoApi.address.decodeSafe(approverAddress);
            if (b4a.equals(approverPublicKey, NULL_BUFFER)) continue;

            const approvalMessage = createMessage(challengeData, proofProposal.proof, approval.approver, proofProposal.signature);
            let approvalVerified = false;
            try {
                const approvalHash = await tracCryptoApi.hash.blake3(approvalMessage);
                approvalVerified = tracCryptoApi.signature.verify(approval.approval_sig, approvalHash, approverPublicKey);
            } catch {
                approvalVerified = false;
            }
            if (approvalVerified) validApprovers.add(approverAddress);
        }

        const indexerCount = Object.values(base.system.indexers).length;
        const quorumThreshold = indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
        const totalValidSigners = 1 + validApprovers.size; // proposer's own verified signature counts as one signer

        if (totalValidSigners < quorumThreshold) {
            this.logger.error(OperationType.SET_EPOCH, `Insufficient valid approvals for quorum. Required ${quorumThreshold}, got ${totalValidSigners}.`, node.from.key)
            return Status.FAILURE;
        }

        const encodedEpochProof = safeEncodeEpochProof({ pd: op.seo.pd, app: op.seo.app });
        if (encodedEpochProof.length === 0) {
            this.logger.error(OperationType.SET_EPOCH, "Failed to encode epoch proof.", node.from.key)
            return Status.FAILURE;
        }

        const epochProofHash = await tracCryptoApi.hash.blake3Safe(encodedEpochProof);
        const nextEpochBuffer = b4a.alloc(8);
        nextEpochBuffer.writeBigUInt64BE(nextEpoch);

        await batch.put(EntryType.EPOCH_CURRENT, nextEpochBuffer);
        await batch.put(EntryType.EPOCH + nextEpoch.toString(), epochProofHash);
        await batch.put(EntryType.EPOCH_HASH + epochProofHash.toString('hex'), encodedEpochProof);

        if (this.#config.enableTxApplyLogs) {
            console.info(`Epoch ${nextEpoch} committed. proposer:approvals - ${proposerAddress}:${validApprovers.size}`);
        }

        this.emitEvent(CustomEventType.EPOCH_CREATED, { epoch: nextEpoch, proposerAddress }); // notify epoch committed
        return Status.SUCCESS;
    }


}

export default SetEpochHandler;
