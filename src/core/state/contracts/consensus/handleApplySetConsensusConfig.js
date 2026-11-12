import b4a from 'b4a';
import { CONSENSUS_CONFIG_INDEX_SIZE, CustomEventType, EntryType, OperationType, UINT32_MAX } from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { safeDecodeConsensusConfig, safeEncodeConsensusConfig } from '../../../../codecs/apply/applyOperationCodec.js';
import { createMessage, NULL_BUFFER, safeReadUint32BE, safeReadUint8, safeWriteUInt32BE } from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import { Status } from '../../utils/transaction.js';

export const handleApplySetConsensusConfig = baseState => class extends baseState {

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
