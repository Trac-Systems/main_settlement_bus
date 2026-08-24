import b4a from 'b4a';
import {
    EntryType,
    OperationType,
    CustomEventType,
} from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import {
    safeEncodeConsensusConfig,
} from '../../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    NULL_BUFFER,
    safeWriteUInt32BE,
} from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import {
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import { createGenesisEpochProof } from '../../utils/epochProof.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class SetGenesisEpochHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    canHandle(operation) {
        return operation.type === OperationType.SET_GENESIS_EPOCH;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateConsensusControlOperation(op)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        }

        // Extract and validate the requester address (admin)
        const requesterAddressBuffer = op.address;
        const requesterAddressString = addressUtils.bufferToAddress(requesterAddressBuffer, this.#config.addressPrefix);
        if (requesterAddressString === null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Requester address is invalid.", node.from.key)
            return Status.FAILURE;
        }

        // Validate requester public key
        const requesterPublicKey = tracCryptoApi.address.decodeSafe(requesterAddressString);
        if (b4a.equals(requesterPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to decode requester public key.", node.from.key)
            return Status.FAILURE;
        }
        // ensure that an admin invoked this operation
        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Invalid admin entry.", node.from.key)
            return Status.FAILURE;
        }

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repo.isAdmin(decodedAdminEntry, node)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        }

        // Extract admin public key
        const adminPublicKey = tracCryptoApi.address.decodeSafe(decodedAdminEntry.address);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        }
        // Admin consistency check
        if (!b4a.equals(adminPublicKey, requesterPublicKey)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        }

        const encodedConsensusConfig = safeEncodeConsensusConfig(op.cco.cc);

        if (encodedConsensusConfig.length === 0) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to encode consensus config.", node.from.key);
            return Status.FAILURE;
        }

        if (!this.#repo.validateConsensusConfig(op.cco.cc)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Consensus config validation failed.", node.from.key);
            return Status.FAILURE;
        }

        // verify requester signature
        const message = createMessage(
            this.#config.networkId,
            op.cco.txv,
            encodedConsensusConfig,
            op.cco.in,
            OperationType.SET_GENESIS_EPOCH
        );

        if (message.length === 0) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        }

        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.cco.tx)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        }

        // verify signature
        const isMessageVerified = tracCryptoApi.signature.verify(op.cco.is, op.cco.tx, adminPublicKey)
        const txHashHexString = op.cco.tx.toString('hex');

        if (!isMessageVerified) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        }

        // verify tx validity - prevent deferred execution attack        
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        }

        if (!b4a.equals(op.cco.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        }

        // anti-replay attack
        const opEntry = await this.#repo.getEntry(txHashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Operation has already been applied.", node.from.key)
            return Status.IGNORE;
        }

        // check if CurrentEpoch have been initialized if yes - failure
        const currentEpoch = await this.#repo.getEntry(EntryType.EPOCH_CURRENT, batch);
        if (currentEpoch !== null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Current epoch is set. Cannot set a new genesis epoch", node.from.key)
            return Status.IGNORE;
        }

        // check if genesis epoch is initialized. If yes - failure
        const epochZero = EntryType.EPOCH + "0";
        const genesisEpochHash = await this.#repo.getEntry(epochZero , batch);
        if (genesisEpochHash !== null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Genesis epoch is set. Cannot set a new one", node.from.key)
            return Status.IGNORE;
        }

        const currentConsensusConfigIndex = await this.#repo.getEntry(
            EntryType.CONSENSUS_CONFIG_CURRENT,
            batch
        );

        const genesisConsensusConfigKey = EntryType.CONSENSUS_CONFIG_RECORD + 0;

        const genesisConsensusConfig = await this.#repo.getEntry(
            genesisConsensusConfigKey,
            batch
        );

        // Check if currently genesis config exists
        if (currentConsensusConfigIndex !== null || genesisConsensusConfig !== null) {
            this.#repo.safeLog(
                OperationType.SET_GENESIS_EPOCH,
                "Genesis consensus config is set. Cannot set a new genesis epoch",
                node.from.key
            );
            return Status.IGNORE;
        }


        const genesisEpoch = await createGenesisEpochProof(
            this.#config,
            requesterAddressString,
            encodedConsensusConfig
        );

        if (genesisEpoch === null) {
            this.#repo.safeLog(OperationType.SET_GENESIS_EPOCH, "Could not initialize genesis epoch", node.from.key)
            return Status.FAILURE;
        }

        // initialize CurrentEpoch field
        const zeroAsUint64Buffer = b4a.alloc(8, 0);
        await batch.put(
            EntryType.EPOCH_CURRENT,
            zeroAsUint64Buffer
        );
        
        // initialize Epoch Field
        const epochProofHash = await tracCryptoApi.hash.blake3Safe(genesisEpoch);
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

        // initialize consensus config schema V1 and make record 0 current
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

        if (this.#config.enableTxApplyLogs) {
            console.info(`Genesis Epoch initialized addr:wk:tx - ${requesterAddressString}:${decodedAdminEntry.wk.toString('hex')}:${txHashHexString}`);
        }

        this.#repo.emitEvent(CustomEventType.GENESIS_EPOCH_CREATED, { epoch: 0n, proposerAddress: requesterAddressString });
        return Status.SUCCESS;
    }


}

export default SetGenesisEpochHandler;
