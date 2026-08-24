import b4a from 'b4a';
import {
    EntryType,
    OperationType,
    UINT32_MAX,
} from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import {
    safeEncodeConsensusConfig,
} from '../../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    NULL_BUFFER,
    safeWriteUInt32BE,
    safeReadUint32BE,
} from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import {
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class SetConsensusConfigHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateConsensusControlOperation(op)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        const requesterAddressString = addressUtils.bufferToAddress(op.address, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }

        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        }

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repo.isAdmin(decodedAdminEntry, node)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        }

        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        const encodedConsensusConfig = safeEncodeConsensusConfig(op.cco.cc);

        if (encodedConsensusConfig.length === 0) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to encode consensus config.", node.from.key);
            return Status.FAILURE;
        }

        if (!this.#repo.validateConsensusConfig(op.cco.cc)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Consensus config validation failed.", node.from.key);
            return Status.FAILURE;
        }

        const message = createMessage(
            this.#config.networkId,
            op.cco.txv,
            encodedConsensusConfig,
            op.cco.in,
            OperationType.SET_CONSENSUS_CONFIG
        );

        if (message.length === 0) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        }

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.cco.tx)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        }

        const isMessageVerified = tracCryptoApi.signature.verify(op.cco.is, op.cco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.cco.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        }

        const txHashHexString = op.cco.tx.toString('hex');
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigBuffer = await this.#repo.getEntry(EntryType.CONSENSUS_CONFIG_CURRENT, batch);
        if (currentConsensusConfigBuffer === null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Initial consensus config has not been initialized yet", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigIndex = safeReadUint32BE(currentConsensusConfigBuffer);
        if (currentConsensusConfigIndex === null) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG,"Failed to read current consensus config index from buffer", node.from.key)
            return Status.FAILURE;
        }
        if (currentConsensusConfigIndex === UINT32_MAX) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Consensus config index overflow.", node.from.key)
            return Status.FAILURE;
        }

        const nextConsensusConfigIndex = currentConsensusConfigIndex + 1;
        const nextConsensusConfigKey = EntryType.CONSENSUS_CONFIG_RECORD + nextConsensusConfigIndex;
        const nextConsensusConfigIndexBuffer = safeWriteUInt32BE(nextConsensusConfigIndex);

        if (nextConsensusConfigIndexBuffer.length === 0) {
            this.#repo.safeLog(OperationType.SET_CONSENSUS_CONFIG, "Failed to encode next consensus config index.", node.from.key);
            return Status.FAILURE;
        }

        await batch.put(EntryType.CONSENSUS_CONFIG_CURRENT, nextConsensusConfigIndexBuffer);
        await batch.put(nextConsensusConfigKey, encodedConsensusConfig);
        await batch.put(txHashHexString, node.value);

        if (this.#config.enableTxApplyLogs) {
            console.info(`VDF params updated addr:wk:tx - ${requesterAddressString}:${decodedAdminEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        return Status.SUCCESS;
    }


}

export default SetConsensusConfigHandler;
