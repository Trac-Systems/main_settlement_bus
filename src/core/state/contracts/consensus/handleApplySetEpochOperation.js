import b4a from 'b4a';
import { CONSENSUS_CONFIG_INDEX_SIZE, ConsensusVersion, CustomEventType, EntryType, EPOCH_BYTE_LENGTH, HASH_BYTE_LENGTH, OperationType } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { verifyWesolowski } from '@tracsystems/trac-vdf';
import { safeDecodeConsensusConfig, safeDecodeEpochProofV1, safeEncodeEpochProofV1, safeEncodeEpochRecord } from '../../../../codecs/apply/applyOperationCodec.js';
import { createMessage, incrementBuffer, isBufferValid, NULL_BUFFER, safeReadUint32BE, safeReadUint8, safeToUIntString, uint16ToBuffer } from '../../../../utils/buffer.js';
import { safeDecodeProofProposal, safeDecodeProofProposalApproval } from '../../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import addressUtils from '../../utils/address.js';
import { Status } from '../../utils/transaction.js';
import { safeDecodeVdfConfig } from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

export const handleApplySetEpochOperation = baseState => class extends baseState {

    async _handleApplySetEpochOperation(op, _view, base, node, batch) {
        if (!this._stateValidationSchema.validateSetEpochOperation(op)) {
            this._safeLogApply(OperationType.SET_EPOCH, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigIndexBuffer = await this._getEntryApply(EntryType.CONSENSUS_CONFIG_CURRENT, batch);
        if (currentConsensusConfigIndexBuffer === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Consensus config is not initialized.", node.from.key)
            return Status.FAILURE;
        }

        if (currentConsensusConfigIndexBuffer.length !== CONSENSUS_CONFIG_INDEX_SIZE) {
            this._safeLogApply(OperationType.SET_EPOCH, "Consensus config data is malformed or corrupted.", node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigIndex = safeReadUint32BE(currentConsensusConfigIndexBuffer);
        const consensusConfigBuffer = await this._getEntryApply(
            EntryType.CONSENSUS_CONFIG_RECORD + currentConsensusConfigIndex,
            batch
        );
        if (consensusConfigBuffer === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Consensus config record does not exist.", node.from.key)
            return Status.FAILURE;
        }

        const consensusConfig = safeDecodeConsensusConfig(consensusConfigBuffer);
        if (consensusConfig === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to decode consensus config.", node.from.key)
            return Status.FAILURE;
        }

        const consensusSchemaVersion = safeReadUint8(consensusConfig.sv);
        const epochSchemaVersion = safeReadUint8(op.seo.sv);
        if (consensusSchemaVersion !== epochSchemaVersion) {
            this._safeLogApply(OperationType.SET_EPOCH, "Epoch schema version does not match the current consensus config.", node.from.key)
            return Status.FAILURE;
        }

        // Use the config at this point in replay, including earlier updates in this batch.
        switch (consensusSchemaVersion) {
            case ConsensusVersion.VDF_V1:
                return await this._applyVdfV1Epoch(op, consensusConfig, base, node, batch);
            default:
                this._safeLogApply(OperationType.SET_EPOCH, "Unsupported epoch schema version.", node.from.key)
                return Status.FAILURE;
        }
    }

    async _applyVdfV1Epoch(op, consensusConfig, base, node, batch) {
        const epochProof = safeDecodeEpochProofV1(op.seo.data);
        if (epochProof === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to decode epoch data.", node.from.key)
            return Status.FAILURE;
        }
        if (!this._stateValidationSchema.validateEpochProofV1(epochProof)) {
            this._safeLogApply(OperationType.SET_EPOCH, "Epoch data schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        const { pd: encodedProofProposal, app: encodedApprovals } = epochProof;

        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.BOOTSTRAP_DEPLOYMENT, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }

        const proofProposal = safeDecodeProofProposal(encodedProofProposal);
        if (proofProposal === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to decode proof proposal.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpochBuffer = await this._getEntryApply(EntryType.EPOCH_CURRENT, batch);
        if (currentEpochBuffer === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Current epoch is not initialized. Genesis epoch has not been set.", node.from.key)
            return Status.FAILURE;
        }

        const nextEpochBuffer = incrementBuffer(currentEpochBuffer, EPOCH_BYTE_LENGTH);
        if (nextEpochBuffer === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Current epoch index value is invalid or corrupted", node.from.key)
            return Status.FAILURE;
        }

        const proposedEpochBuffer = proofProposal.epoch;
        const epochIndexCompare = b4a.compare(nextEpochBuffer, proposedEpochBuffer)

        // String helpers
        const currentEpochStr = safeToUIntString(currentEpochBuffer);
        const nextEpochStr = safeToUIntString(nextEpochBuffer);
        if (nextEpochStr === null || currentEpochStr === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Epoch index data is malformed or corrupted.", node.from.key)
            return Status.FAILURE;
        }

        if (epochIndexCompare > 0) { // proposedEpoch < nextEpoch
            this._safeLogApply(OperationType.SET_EPOCH, `Stale epoch proposal. Epoch ${currentEpochStr} is already committed.`, node.from.key)
            return Status.IGNORE;
        }

        if (epochIndexCompare < 0) { // proposedEpoch > nextEpoch
            this._safeLogApply(OperationType.SET_EPOCH, `Unexpected epoch. Proposal must target epoch ${nextEpochStr} but got ${safeToUIntString(proposedEpochBuffer)}.`, node.from.key)
            return Status.FAILURE;
        }

        const expectedNetworkId = uint16ToBuffer(this._config.networkId);
        if (!b4a.equals(proofProposal.network_id, expectedNetworkId)) {
            this._safeLogApply(OperationType.SET_EPOCH, "Invalid proof proposal network id.", node.from.key)
            return Status.FAILURE;
        }

        const currentEpochHash = await this._getEntryApply(EntryType.EPOCH + currentEpochStr, batch);
        if (currentEpochHash === null || !b4a.equals(currentEpochHash, proofProposal.previous_epoch_record_hash)) {
            this._safeLogApply(OperationType.SET_EPOCH, `Previous epoch record hash mismatch for epoch ${currentEpochStr}.`, node.from.key)
            return Status.FAILURE;
        }

        const decodedVdfParams = safeDecodeVdfConfig(consensusConfig.cd);
        if (decodedVdfParams === null) {
            this._safeLogApply(OperationType.SET_EPOCH, "Invalid VDF params value.", node.from.key)
            return Status.FAILURE;
        }

        const { difficulty, discriminantBitSize } = decodedVdfParams;
        if (
            !b4a.equals(difficulty, proofProposal.difficulty) ||
            !b4a.equals(discriminantBitSize, proofProposal.discriminant_bit_size)
        ) {
            this._safeLogApply(OperationType.SET_EPOCH, "VDF parameters do not match the current consensus config.", node.from.key)
            return Status.FAILURE;
        }

        const indexers = Object.values(base.system.indexers);
        const indexerAddresses = new Set();
        for (const indexer of indexers) {
            const indexerAddressBuffer = await this._getRegisteredWriterKeyApply(batch, indexer.key.toString('hex'));
            if (!indexerAddressBuffer) continue;
            const indexerAddress = addressUtils.bufferToAddress(indexerAddressBuffer, this._config.addressPrefix);
            if (indexerAddress) indexerAddresses.add(indexerAddress);
        }

        const proposerAddress = addressUtils.bufferToAddress(proofProposal.proposer, this._config.addressPrefix);
        if (!proposerAddress || !indexerAddresses.has(proposerAddress)) {
            this._safeLogApply(OperationType.SET_EPOCH, "Proposer is not a registered indexer.", node.from.key)
            return Status.FAILURE;
        }

        const indexerCount = indexers.length;
        const quorumThreshold = indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
        const approvalCount = 1 + encodedApprovals.length; // proposer plus submitted approvals (proposer's own verified signature counts as one approval)

        if (approvalCount < quorumThreshold) {
            this._safeLogApply(OperationType.SET_EPOCH, `Insufficient submitted approvals for quorum. Required ${quorumThreshold}, got ${approvalCount}.`, node.from.key)
            return Status.FAILURE;
        }

        const challengeData = createMessage(
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size
        );

        const proposerPublicKey = tracCryptoApi.address.decodeSafe(proposerAddress);
        let proposalSignatureVerified = false;
        if (!b4a.equals(proposerPublicKey, NULL_BUFFER)) {
            const proposalMessage = createMessage(challengeData, proofProposal.proof);
            const proposalHash = await tracCryptoApi.hash.blake3Safe(proposalMessage);
            proposalSignatureVerified = tracCryptoApi.signature.verify(proofProposal.signature, proposalHash, proposerPublicKey);
        }
        if (!proposalSignatureVerified) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to verify proof proposal signature.", node.from.key)
            return Status.FAILURE;
        }

        const approvalErrorMessage = await this._validateEpochApprovals(
            encodedApprovals,
            indexerAddresses,
            proposerAddress,
            challengeData,
            proofProposal
        );
        if (approvalErrorMessage) {
            this._safeLogApply(OperationType.SET_EPOCH, approvalErrorMessage, node.from.key)
            return Status.FAILURE;
        }

        let vdfProofVerified = false;
        try {
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
            this._safeLogApply(OperationType.SET_EPOCH, "VDF proof is invalid.", node.from.key)
            return Status.FAILURE;
        }

        const encodedEpochProof = safeEncodeEpochProofV1(epochProof);
        if (encodedEpochProof.length === 0) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to encode epoch proof.", node.from.key)
            return Status.FAILURE;
        }

        const encodedEpochRecord = safeEncodeEpochRecord({ sv: op.seo.sv, data: encodedEpochProof });
        if (encodedEpochRecord.length === 0) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to encode epoch record.", node.from.key)
            return Status.FAILURE;
        }

        const epochProofHash = await tracCryptoApi.hash.blake3Safe(encodedEpochRecord);
        if (!isBufferValid(epochProofHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.SET_EPOCH, "Failed to hash epoch proof.", node.from.key)
            return Status.FAILURE;
        }

        await batch.put(EntryType.EPOCH_CURRENT, nextEpochBuffer);
        await batch.put(EntryType.EPOCH + nextEpochStr, epochProofHash);
        await batch.put(EntryType.EPOCH_HASH + epochProofHash.toString('hex'), encodedEpochRecord);

        if (this._config.enableTxApplyLogs) {
            console.info(`Epoch ${nextEpochStr} committed. proposer:approvals - ${proposerAddress}:${encodedApprovals.length + 1}`); // We should account for the proposer approval too, hence the '+ 1' at the end
        }

        this._emitEvent(CustomEventType.EPOCH_CREATED, { epoch: b4a.from(nextEpochBuffer), proposerAddress }); // notify epoch committed
        return Status.SUCCESS;
    }

    async _validateEpochApprovals(encodedApprovals, indexerAddresses, proposerAddress, challengeData, proofProposal) {
        const approverIdentities = new Set();

        for (const encodedApproval of encodedApprovals) {
            const approval = safeDecodeProofProposalApproval(encodedApproval);
            if (approval === null) return 'Failed to decode epoch approval.';

            const approverAddress = addressUtils.bufferToAddress(approval.approver, this._config.addressPrefix);
            if (!approverAddress) return 'Epoch approval contains an invalid approver.';
            if (approverAddress === proposerAddress) return 'Proposer cannot approve its own epoch proposal.';
            if (!indexerAddresses.has(approverAddress)) return 'Epoch approver is not a registered indexer.';
            if (approverIdentities.has(approverAddress)) return 'Epoch approval contains a duplicate approver.';

            const approverPublicKey = tracCryptoApi.address.decodeSafe(approverAddress);
            if (b4a.equals(approverPublicKey, NULL_BUFFER)) return 'Failed to decode epoch approver public key.';

            const approvalMessage = createMessage(
                challengeData,
                proofProposal.proof,
                approval.approver,
                proofProposal.signature
            );
            let approvalVerified = false;
            const approvalHash = await tracCryptoApi.hash.blake3Safe(approvalMessage);
            approvalVerified = tracCryptoApi.signature.verify(
                approval.approval_sig,
                approvalHash,
                approverPublicKey
            );

            if (!approvalVerified) return 'Failed to verify epoch approval signature.';

            approverIdentities.add(approverAddress);
        }

        return null;
    }
};
