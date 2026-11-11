import b4a from 'b4a';
import { CONSENSUS_CONFIG_INDEX_SIZE, CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH, ConsensusVersion, CustomEventType, EntryType, EPOCH_BYTE_LENGTH, HASH_BYTE_LENGTH, OperationType, UINT32_MAX, VDF_PROOF_BYTE_LENGTHS } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { verifyWesolowski } from '@tracsystems/trac-vdf';
import { safeDecodeConsensusConfig, safeDecodeEpochProofV1, safeEncodeConsensusConfig, safeEncodeEpochProofV1, safeEncodeEpochRecord } from '../../../codecs/apply/applyOperationCodec.js';
import { createMessage, incrementBuffer, isBufferValid, isZeroBuffer, NULL_BUFFER, safeReadUint32BE, safeReadUint8, safeToUIntString, safeWriteUInt32BE, uint16ToBuffer } from '../../../utils/buffer.js';
import { safeDecodeProofProposal, safeDecodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import addressUtils from '../utils/address.js';
import adminEntryUtils from '../utils/adminEntry.js';
import { Status } from '../utils/transaction.js';
import { createGenesisEpochProof } from '../utils/epochProof.js';
import { safeDecodeVdfConfig } from '../../../codecs/consensus/v1/vdfConfigCodec.js';

export const withConsensusApply = Base => class extends Base {

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

    _validateConsensusConfigApply(consensusConfig) {
        if (!isBufferValid(consensusConfig?.sv, CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH)) {
            return false;
        }

        switch (safeReadUint8(consensusConfig.sv)) {
            case ConsensusVersion.VDF_V1: {
                const configData = safeDecodeVdfConfig(consensusConfig.cd);
                if (configData === null) return false;

                return !isZeroBuffer(configData.difficulty) &&
                    Object.hasOwn(VDF_PROOF_BYTE_LENGTHS, configData.discriminantBitSize.readUInt16BE(0));
            }
            default:
                return false;
        }
    }

    async _handleApplySetGenesisEpoch(op, view, base, node, batch) {
        if (!this._stateValidationSchema.validateConsensusControlOperation(op)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }
        // ensure that an admin invoked this operation
        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        }

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);
        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        }

        // Extract admin public key
        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        }
        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        const encodedConsensusConfig = safeEncodeConsensusConfig(op.cco.cc);

        if (encodedConsensusConfig.length === 0) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Failed to encode consensus config.", node.from.key);
            return Status.FAILURE;
        }

        if (!this._validateConsensusConfigApply(op.cco.cc)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Consensus config validation failed.", node.from.key);
            return Status.FAILURE;
        }

        // verify requester signature
        const message = createMessage(
            this._config.networkId,
            op.cco.txv,
            encodedConsensusConfig,
            op.cco.in,
            OperationType.SET_GENESIS_EPOCH
        );

        if (message.length === 0) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        }

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.cco.tx)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        }

        // verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cco.is, op.cco.tx, adminPublicKey)
        const txHashHexString = op.cco.tx.toString('hex');

        if (!isMessageVerified) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.cco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }

        // check if CurrentEpoch have been initialized if yes - failure
        const currentEpoch = await this._getEntryApply(EntryType.EPOCH_CURRENT, batch);
        if (currentEpoch !== null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Current epoch is set. Cannot set a new genesis epoch", node.from.key)
            return Status.IGNORE;
        }

        // check if genesis epoch is initialized. If yes - failure
        const epochZero = EntryType.EPOCH + "0";
        const genesisEpochHash = await this._getEntryApply(epochZero , batch);
        if (genesisEpochHash !== null) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Genesis epoch is set. Cannot set a new one", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigIndex = await this._getEntryApply(
            EntryType.CONSENSUS_CONFIG_CURRENT,
            batch
        );

        const genesisConsensusConfigKey = EntryType.CONSENSUS_CONFIG_RECORD + 0;

        const genesisConsensusConfig = await this._getEntryApply(
            genesisConsensusConfigKey,
            batch
        );

        // Check if currently genesis config exists
        if (currentConsensusConfigIndex !== null || genesisConsensusConfig !== null) {
            this._safeLogApply(
                OperationType.SET_GENESIS_EPOCH,
                "Genesis consensus config is set. Cannot set a new genesis epoch",
                node.from.key
            );
            return Status.IGNORE;
        }


        const genesisEpoch = await createGenesisEpochProof(
            requesterAddressString,
            encodedConsensusConfig,
            this._config
        );

        if (!b4a.isBuffer(genesisEpoch) || genesisEpoch.length === 0) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Could not initialize genesis epoch", node.from.key)
            return Status.FAILURE;
        }

        const epochProofHash = await tracCryptoApi.hash.blake3Safe(genesisEpoch);
        if (!isBufferValid(epochProofHash, HASH_BYTE_LENGTH)) {
            this._safeLogApply(OperationType.SET_GENESIS_EPOCH, "Failed to hash genesis epoch proof.", node.from.key)
            return Status.FAILURE;
        }

        // initialize CurrentEpoch field
        const zeroAsUint64Buffer = b4a.alloc(8, 0);
        await batch.put(
            EntryType.EPOCH_CURRENT,
            zeroAsUint64Buffer
        );

        // initialize Epoch Field
        await batch.put(
            epochZero,
            epochProofHash
        );

        // initialize EpochHash Field
        const epochProofHashString = epochProofHash.toString('hex');
        const epochHashLedgerEntry = EntryType.EPOCH_HASH + epochProofHashString;
        await batch.put(
            epochHashLedgerEntry,
            genesisEpoch
        );

        // Record 0 preserves the initial config, including the genesis format version.
        await batch.put(
            EntryType.CONSENSUS_CONFIG_CURRENT,
            safeWriteUInt32BE(0)
        );
        await batch.put(
            genesisConsensusConfigKey,
            encodedConsensusConfig
        );

        // Put txHashHexString into the state to avoid replay attack
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Genesis Epoch initialized addr:wk:tx - ${requesterAddressString}:${decodedAdminEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this._emitEvent(CustomEventType.GENESIS_EPOCH_CREATED, { epoch: 0n, proposerAddress: requesterAddressString });
        return Status.SUCCESS;
    }

    async _handleApplySetConsensusConfig(op, _view, base, node, batch, postApplyEvents) {
        if (!this._stateValidationSchema.validateConsensusControlOperation(op)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        const requesterAddressString = addressUtils.bufferToAddress(op.address, this._config.addressPrefix);
        if (requesterAddressString === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }

        const adminEntry = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        }

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this._config.addressPrefix);
        if (decodedAdminEntry === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this._isAdminApply(decodedAdminEntry, node)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        }

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        const encodedConsensusConfig = safeEncodeConsensusConfig(op.cco.cc);

        if (encodedConsensusConfig.length === 0) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to encode consensus config.", node.from.key);
            return Status.FAILURE;
        }

        if (!this._validateConsensusConfigApply(op.cco.cc)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Consensus config validation failed.", node.from.key);
            return Status.FAILURE;
        }

        const message = createMessage(
            this._config.networkId,
            op.cco.txv,
            encodedConsensusConfig,
            op.cco.in,
            OperationType.SET_CONSENSUS_CONFIG
        );

        if (message.length === 0) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        }

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.cco.tx)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        }

        const isMessageVerified = tracCryptoApi.signature.verify(op.cco.is, op.cco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        const indexersSequenceState = await this._getIndexerSequenceStateApply(base);
        if (indexersSequenceState === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.cco.txv, indexersSequenceState)) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        }

        const txHashHexString = op.cco.tx.toString('hex');
        const opEntry = await this._getEntryApply(txHashHexString, batch);
        if (opEntry !== null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigIndexBuffer = await this._getEntryApply(EntryType.CONSENSUS_CONFIG_CURRENT, batch);
        if (currentConsensusConfigIndexBuffer === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Initial consensus config has not been initialized yet", node.from.key)
            return Status.IGNORE;
        }

        if (currentConsensusConfigIndexBuffer.length !== CONSENSUS_CONFIG_INDEX_SIZE) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Consensus config index is malformed or corrupted.", node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigIndex = safeReadUint32BE(currentConsensusConfigIndexBuffer);
        if (currentConsensusConfigIndex === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG,"Failed to read current consensus config index from buffer", node.from.key)
            return Status.FAILURE;
        }
        if (currentConsensusConfigIndex === UINT32_MAX) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Consensus config index overflow.", node.from.key)
            return Status.FAILURE;
        }

        const currentConsensusConfigBuffer = await this._getEntryApply(
            EntryType.CONSENSUS_CONFIG_RECORD + currentConsensusConfigIndex,
            batch
        );
        const currentConsensusConfig = safeDecodeConsensusConfig(currentConsensusConfigBuffer);
        if (currentConsensusConfig === null) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode current consensus config.", node.from.key)
            return Status.FAILURE;
        }

        const currentSchemaVersion = safeReadUint8(currentConsensusConfig.sv);
        const nextSchemaVersion = safeReadUint8(op.cco.cc.sv);
        if (currentSchemaVersion === null || currentSchemaVersion === 0) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Current consensus config schema version is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Same-version parameter changes are allowed; returning to an older consensus is not.
        if (nextSchemaVersion < currentSchemaVersion) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Consensus config schema version cannot decrease.", node.from.key)
            return Status.FAILURE;
        }

        const nextConsensusConfigIndex = currentConsensusConfigIndex + 1;
        const nextConsensusConfigKey = EntryType.CONSENSUS_CONFIG_RECORD + nextConsensusConfigIndex;
        const nextConsensusConfigIndexBuffer = safeWriteUInt32BE(nextConsensusConfigIndex);

        if (nextConsensusConfigIndexBuffer.length === 0) {
            this._safeLogApply(OperationType.SET_CONSENSUS_CONFIG, "Failed to encode next consensus config index.", node.from.key);
            return Status.FAILURE;
        }

        await batch.put(EntryType.CONSENSUS_CONFIG_CURRENT, nextConsensusConfigIndexBuffer);
        await batch.put(nextConsensusConfigKey, encodedConsensusConfig);
        await batch.put(txHashHexString, node.value);

        if (this._config.enableTxApplyLogs) {
            console.info(`Consensus config updated addr:wk:tx - ${requesterAddressString}:${decodedAdminEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        postApplyEvents.push({
            type: CustomEventType.CONSENSUS_CONFIG_CHANGED,
        });

        return Status.SUCCESS;
    }
};
