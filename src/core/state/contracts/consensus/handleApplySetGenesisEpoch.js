import b4a from 'b4a';
import { CustomEventType, EntryType, HASH_BYTE_LENGTH, OperationType } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { safeEncodeConsensusConfig } from '../../../../codecs/apply/applyOperationCodec.js';
import { createMessage, isBufferValid, NULL_BUFFER, safeWriteUInt32BE } from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import { Status } from '../../utils/transaction.js';
import { createGenesisEpochProof } from '../../utils/epochProof.js';

export const handleApplySetGenesisEpoch = baseState => class extends baseState {

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
};
