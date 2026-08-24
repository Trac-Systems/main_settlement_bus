import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import {
    ACK_INTERVAL,
    EntryType,
    AUTOBASE_VALUE_ENCODING,
    HYPERBEE_KEY_ENCODING,
    HYPERBEE_VALUE_ENCODING,
    TRAC_NAMESPACE,
    EventType,
    ConsensusConfigSchemaVersion,
} from '../../utils/constants.js';
import { isHexString, sleep, isTransactionRecordPut } from '../../utils/helpers.js';
import tracCryptoApi from 'trac-crypto-api';
import StateValidationSchema from './validators/StateValidationSchema.js';
import {
    decodeConsensusConfig,
} from '../../codecs/apply/applyOperationCodec.js';
import {
    safeWriteUInt32BE,
} from '../../utils/buffer.js';
import addressUtils from './utils/address.js';
import adminEntryUtils from './utils/adminEntry.js';
import nodeEntryUtils from './utils/nodeEntry.js';
import lengthEntryUtils from './utils/lengthEntry.js';
import transactionUtils from './utils/transaction.js';
import remote from 'hypercore/lib/fully-remote-proof.js'
import PQueue from 'p-queue';
import { decodeVdfConfig } from '../../codecs/consensus/v1/vdfConfigCodec.js';
import _ from 'lodash';
import ApplyState from './apply/ApplyState.js';


// TODO: #addWriter, #removeWriter, #transfer, #transferFeeTxOperation need to be refactored to get in arguments actor's nodeEntries in buffer format.

class State extends ReadyResource {
    #writeQueue = new PQueue({ concurrency: 1 });
    #base;
    #bee;
    #store;
    #writingKey;
    #config
    #wallet
    #stateValidationSchema;
    #applyState;
    #activeWriterCountCache = new Map();

    /**
     * @param {Corestore} store
     * @param {IWallet} wallet
     * @param {Config} config
     **/
    constructor(store, wallet, config) {
        super();

        this.#config = config
        this.#wallet = wallet
        this.#store = store;

        this.#stateValidationSchema = new StateValidationSchema(config);
        this.#applyState = new ApplyState(this.#config, this.#stateValidationSchema, this);
        this.#base = new Autobase(this.#store, this.#config.bootstrap, {
            ackInterval: ACK_INTERVAL,
            valueEncoding: AUTOBASE_VALUE_ENCODING,
            bigBatches: false,
            optimistic: false,
            open: this.#setupHyperbee.bind(this),
            apply: this.applyHandler,
        })
    }

    get base() {
        return this.#base;
    }

    get writingKey() {
        return this.#writingKey;
    }

    get stateValidationSchema() {
        return this.#stateValidationSchema;
    }

    get applyHandler() {
        return this.#applyState.apply.bind(this.#applyState);
    }

    async _open() {
        console.log("State initialization...")
        await this.#base.ready();
        this.#writingKey = this.#base.local.key;

        await this.#listeners()
    }

    async _close() {
        console.log("State: closing gracefully...");

        this.removeAllListeners();

        if (this.#bee !== null) {
            await this.#bee.close();
        }
        await sleep(100);

        [EventType.IS_INDEXER, 
            EventType.IS_NON_INDEXER,
            EventType.WRITABLE,
            EventType.UNWRITABLE
        ].forEach(event => {
            this.#base.removeAllListeners(event)
        })

        if (this.#base !== null) {
            await this.#base.close();
        }
        await sleep(100);
    }


    async #listeners() {
        this.#base.on(EventType.IS_INDEXER, () => {
            console.log("Current node is an indexer");
        });

        this.#base.on(EventType.IS_NON_INDEXER, async () => {
            // Prevent further actions if closing is in progress
            // The reason is that getNodeEntry is async and may cause issues if we will access state after closing
            console.log("Current node is not an indexer anymore");
        });

        this.#base.on(EventType.WRITABLE, async () => {
            console.log("Current node is writable");
        });

        this.#base.on(EventType.UNWRITABLE, async () => {
            console.log("Current node is unwritable");
        });
    }

    isWritable() {
        return this.#base.writable;
    }

    isIndexer() {
        return this.#base.isIndexer;
    }

    async indexerCount() {
        return (await this.getIndexersEntry()).length;
    }

    getUnsignedLength() {
        return this.#base.view.core.length;
    }

    getSignedLength() {
        return this.#base.view.core.signedLength;
    }

    /**
     * Reads the current epoch id from signed state.
     *
     * @returns {Promise<bigint|null>} Current epoch id, or `null` when genesis
     * epoch state has not been initialized.
     */
    async getCurrentEpoch() {
        const currentEpoch = await this.getSigned(EntryType.EPOCH_CURRENT);
        return _.isNil(currentEpoch) ? null : currentEpoch.readBigUInt64BE(0);
    }

    /**
     * Reads the required current epoch id from signed state.
     *
     * @returns {Promise<bigint>} Current epoch id.
     * @throws {Error} When genesis epoch state has not been initialized.
     */
    async requireCurrentEpoch() {
        const currentEpoch = await this.getCurrentEpoch();
        if (_.isNil(currentEpoch)) {
            throw new Error(
                'Current epoch is not initialized. Genesis epoch has not been set.'
            );
        }
        return currentEpoch;
    }

    /**
     * Reads the epoch hash stored under `/epoch/<epoch>`.
     *
     * @param {bigint|number|string} count Epoch id.
     * @returns {Promise<Buffer|null>} Epoch hash, or `null` when the epoch is not stored.
     * @throws {Error} When epoch id is missing or invalid.
     */
    async getEpoch(count) {
        if (_.isNil(count)) {
            throw new Error(
                'Cannot read epoch: epoch id is required.'
            );
        }

        const epochId = typeof count === 'bigint' ? count : BigInt(count);
        return await this.getSigned(EntryType.EPOCH + epochId.toString());
    }

    /**
     * Reads the required epoch hash stored under `/epoch/<epoch>`.
     *
     * @param {bigint|number|string} count Epoch id.
     * @returns {Promise<Buffer>} Epoch hash.
     * @throws {Error} When epch id is missing or invalid, or the epoch is not stored.
     */
    async requireEpoch(count) {
        const epochHash = await this.getEpoch(count);
        if (_.isNil(epochHash)) {
            const epochId = typeof count === 'bigint' ? count : BigInt(count);
            throw new Error(
                `Cannot read epoch ${epochId}: epoch is not initialized or does not exist.`
            );
        }
        return epochHash;
    }

    /**
     * Reads the encoded epoch proof stored under `/epochHash/<epochHash>`.
     *
     * @param {Buffer|string} epochHash Epoch hash as a buffer or hex string.
     * @returns {Promise<Buffer|null>} Encoded epoch proof, or `null` when it is not stored.
     * @throws {Error} When epoch hash is missing.
     */
    async getEpochProof(epochHash) {
        if (_.isNil(epochHash)) {
            throw new Error('Cannot read epoch proof: epoch hash is required.');
        }

        const epochHashString = b4a.isBuffer(epochHash) ? epochHash.toString('hex') : epochHash.toString();
        return await this.getSigned(EntryType.EPOCH_HASH + epochHashString);
    }

    /**
     * Reads the required encoded epoch proof stored under `/epochHash/<epochHash>`.
     *
     * @param {Buffer|string} epochHash Epoch hash as a buffer or hex string.
     * @returns {Promise<Buffer>} Encoded epoch proof.
     * @throws {Error} When epoch hash is missing or the epoch proof is not stored.
     */
    async requireEpochProof(epochHash) {
        const epochProof = await this.getEpochProof(epochHash);
        if (_.isNil(epochProof)) {
            const epochHashString = b4a.isBuffer(epochHash) ? epochHash.toString('hex') : epochHash.toString();
            throw new Error(
                `Cannot read epoch proof ${epochHashString}: epoch proof is not initialized or does not exist.`
            );
        }
        return epochProof;
    }

    getFee() {
        return transactionUtils.FEE;
    }

    async get(key) {
        const result = await this.#base.view.get(key);
        if (result === null) return null;
        return result.value;
    }

    async waitForUnsigned(txHash, timeout, interval = 200) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            await sleep(interval);
            const entry = await this.get(txHash);
            if (entry) return true;
        }

        return false;
    }

    async getSigned(key) {
        const view_session = this.#base.view.checkout(this.#base.view.core.signedLength);
        try {
            const result = await view_session.get(key);
            return result ? result.value : null;
        } finally {
            await view_session.close();
        }
    }

    async getAdminEntry() {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        return adminEntry ? adminEntryUtils.decode(adminEntry, this.#config.addressPrefix) : null;
    }

    async getNodeEntry(address) {
        const nodeEntry = await this.getSigned(address);
        return nodeEntry ? nodeEntryUtils.decode(nodeEntry) : null;
    }

    async getNodeEntryUnsigned(address) {
        const nodeEntry = await this.get(address);
        return nodeEntry ? nodeEntryUtils.decode(nodeEntry) : null;
    }

    async allowedToValidate(address) {
        const localWritable = this.isWritable(); // signed
        const localIndexer = this.isIndexer(); // signed

        const unsignedNodeEntry = await this.getNodeEntryUnsigned(address);
        if (!unsignedNodeEntry) return false;

        const unsignedIsWriter = unsignedNodeEntry.isWriter;
        const unsignedIsIndexer = unsignedNodeEntry.isIndexer;

        return !!(localWritable && !localIndexer) && (unsignedIsWriter && !unsignedIsIndexer)
    }
    
    async isAdmin() {
        const adminEntry = await this.getAdminEntry();
        return !!adminEntry && this.#wallet?.address === adminEntry?.address && b4a.equals(adminEntry?.wk, this.writingKey)
    }

    async isAdminAddress(targetAddress) {
        const adminEntry = await this.getAdminEntry();
        return (adminEntry?.address === targetAddress);
    }

    async isAdminAllowedToValidate() {
        if (!this.writingKey) return false;

        const isAdmin = this.writingKey.toString('hex') === this.#config.bootstrap.toString('hex');
        const isIndexer = this.isIndexer();
        const activeWriters = await this.getActiveWriterCount(true);
        const lengthCondition = activeWriters < this.#config.maxWritersForAdminIndexerConnection;
        return !!(isAdmin && isIndexer && lengthCondition);
    }

    async isAddressWhitelisted(address) {
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return false;
        return !!nodeEntry.isWhitelisted;
    }

    async getIndexersEntry() {
        return Object.values(this.#base.system.indexers);
    }

    /**
     * Checks whether a bech32m address belongs to a registered indexer.
     * @param {string} targetAddress Address to check.
     * @returns {Promise<boolean>} True when the address belongs to an indexer in signed state.
     */
    async isIndexerAddress(targetAddress) {
        const targetAddressBuffer = addressUtils.addressToBuffer(targetAddress, this.#config.addressPrefix);
        if (targetAddressBuffer.length === 0) return false;
        const entries = await this.getIndexersEntry();
        for (const entry of entries) {
            const address = await this.getSigned(EntryType.WRITER_ADDRESS + b4a.toString(entry.key, 'hex'));
            if (address && b4a.equals(targetAddressBuffer, address)) return true;
        }
        return false;
    }

    async getActiveWriterCount(excludeAdmin = false) {
        const cached = this.#activeWriterCountCache.get(excludeAdmin);
        const systemLength = this.#base.system?.core?.length ?? -1;

        if (cached && cached.systemLength === systemLength) {
            return cached.value;
        }

        const activeAddresses = new Set();
        const adminAddress = (await this.getAdminEntry())?.address ?? null;

        // sometimes autobase swaps _applyState while performing a bump which will generate the system to be "empty" (it is just a proxy getter to applyState with a null check).
        // since this thing is responsible for permissions, it was opted out to perform a realignment check prior instead of safe navigating to respond the query (especially given that there is a cache in place).
        await this.refresh()

        for await (const { key, value } of this.#base.system.list()) {
            if (!key || !value || value.isRemoved) continue;

            const writerKeyHex = key.toString('hex');
            const addressBuffer = await this.getRegisteredWriterKey(writerKeyHex);
            if (!addressBuffer) continue;

            const address = addressUtils.bufferToAddress(addressBuffer, this.#config.addressPrefix);
            if (!address) continue;

            // Non-admin indexers do not participate in validator capacity decisions.
            if (value.isIndexer && address !== adminAddress) continue;
            if (excludeAdmin && address === adminAddress) continue;

            activeAddresses.add(address);
        }

        const count = activeAddresses.size;
        this.#activeWriterCountCache.set(excludeAdmin, { systemLength, value: count });
        return count;
    }

    async refresh() {
        return await this.#base.update()
    }

    async isWkInIndexersEntry(wk) {
        if (wk === null) return false;
        const indexerListHasWk = Object.values(this.#base.system.indexers)
            .some(entry => b4a.equals(entry.key, wk));
        return indexerListHasWk;
    }

    async getWriterLength() {
        const writersLength = await this.getSigned(EntryType.WRITERS_LENGTH);
        return writersLength ? lengthEntryUtils.decodeBE(writersLength) : null;
    }

    // Not using it, but figured it might spark an idea for a cli command for licenses count or some util.
    async getLicenseCount() {
        const licenseLength = await this.getSigned(EntryType.LICENSE_COUNT);
        return licenseLength ? lengthEntryUtils.decodeBE(licenseLength) : null;
    }

    async getAddressByLicenseId(licenseId) {
        const address = await this.getSigned(EntryType.LICENSE_INDEX + licenseId);
        return address ? addressUtils.bufferToAddress(address, this.#config.addressPrefix) : null;
    }

    async getWriterIndex(index) {
        if (index < 0 || index > Number.MAX_SAFE_INTEGER) return null;
        const writerPublicKey = await this.getSigned(EntryType.WRITERS_INDEX + index);
        return writerPublicKey ? writerPublicKey : null;
    }

    async getRegisteredBootstrapEntry(bootstrap) {
        if (!bootstrap || !isHexString(bootstrap) || bootstrap.length !== 64) return null;
        return await this.getSigned(EntryType.DEPLOYMENT + bootstrap);
    }

    async getRegisteredBootstrapEntryUnsigned(bootstrap) {
        if (!bootstrap || !isHexString(bootstrap) || bootstrap.length !== 64) return null;
        return await this.get(EntryType.DEPLOYMENT + bootstrap);
    }

    async append(payload) {
        return this.#writeQueue.add(() => this.#base.append(payload));
    }

    async appendWithProofOfPublication(batch, batchTxHashes) {
        return this.#writeQueue.add(async () => {

            const core = this.#base.local;
            const end = await this.#base.append(batch);
            const start = end - batch.length;
            const timestamp = new Date();
            const snapshot = core.snapshot(); // consistent view while generating proofs.
            await snapshot.ready();
            // TODO: check state if specific tx has been appened THEN generate a proof.
            try {
                const receipts = [];
                let failedProofs = 0;
                for (let i = 0; i < batch.length; i++) {
                    const blockNumber = start + i;
                    const completeTx = batch[i];
                    const txHash = batchTxHashes[i];

                    let proof = null;
                    let proofError = null;

                    // wait:false makes get fail fast (null) instead of waiting for missing data/replication.
                    const rawBlock = await snapshot.get(blockNumber, { raw: true, wait: false });
                    if (!rawBlock) {
                        proofError = `Missing raw block after append (block=${blockNumber}, start=${start}, end=${end})`;
                        failedProofs++;
                    } else {
                        try {
                            proof = await remote.proof(snapshot, { index: blockNumber, block: rawBlock });
                        } catch (error) {
                            proofError = `Proof generation failed (block=${blockNumber}, start=${start}, end=${end}): ${error?.message ?? 'unknown error'}`;
                            failedProofs++;
                        }
                    }
                    receipts.push({
                        txHash,
                        completeTx,
                        proof,
                        proofError,
                        timestamp,
                        blockNumber
                    });
                }
                if (failedProofs > 0) {
                    console.error(`appendWithProof completed with ${failedProofs} proof failures (batch=${batch.length})`);
                }
                return receipts;
            } finally {
                await snapshot.close();
            }
        });
    }

    async verifyProofOfPublication(proof) {
        // Valid concern. We currently rely on Hypercore’s internal fully-remote-proof helper, which requires low-level storage access
        const out = await remote.verify(this.#store.storage, proof);
        if (!out) throw new Error('Proof of publication verification failed');
        return out;
    }

    async getIndexerSequenceState() {
        const buf = []
        for (const indexer of Object.values(this.#base.system.indexers)) {
            buf.push(indexer.key);
        }
        return await tracCryptoApi.hash.blake3(b4a.concat(buf));
    }

    async isInitalizationDisabled() {
        // Retrieve the flag to verify if initialization is allowed
        let initialization = await this.getSigned(EntryType.INITIALIZATION);

        if (initialization === null) {
            return false
        } else {
            return b4a.equals(initialization, safeWriteUInt32BE(0))
        }
    }

    async getTransactionConfirmedLength(hash) {
        if (!isHexString(hash) || hash.length !== 64) {
            throw new Error("Invalid hash format");
        }

        const confirmedLength = this.getSignedLength();
        const historyStream = this.#base.view.createHistoryStream({
            gte: 0,
            lte: confirmedLength
        });

        for await (const entry of historyStream) {
            if (isTransactionRecordPut(entry) && entry.key === hash) {
                return entry.seq;
            }
        }
        return null;
    }

    async confirmedTransactionsBetween(startSignedLength, endSignedLength) {
        if (!Number.isInteger(startSignedLength) || !Number.isInteger(endSignedLength)) {
            throw new Error("Params must be integer");
        }

        if (startSignedLength < 0 || endSignedLength < 0) {
            throw new Error("Params must be non-negative");
        }

        if (startSignedLength > endSignedLength) {
            throw new Error("endSignedLength must be greater than or equal to startSignedLength");
        }

        if (startSignedLength === endSignedLength) return [];

        const currentSignedLength = this.getSignedLength();
        const signedLength2End = Math.min(currentSignedLength, endSignedLength);

        const startSeq = startSignedLength;
        const endSeq = signedLength2End - 1;

        if (startSeq > endSeq) {
            throw new Error("Invalid range");
        }

        const historyStream = this.#base.view.createHistoryStream({
            gte: startSeq,
            lte: endSeq
        });

        const filters = (entry) => {
            const isPut = entry.type === "put";
            const isHex = isHexString(entry.key);
            const is64 = entry.key.length === 64;
            return isPut && isHex && is64;
        }

        let hashes = [];
        for await (const entry of historyStream) {
            if (filters(entry)) {
                hashes.push({ hash: entry.key, confirmed_length: entry.seq });
            }
        }

        return hashes;
    }

    async getRegisteredWriterKey(writingKey) {
        const entry = await this.get(EntryType.WRITER_ADDRESS + writingKey);
        return entry ? addressUtils.addressToBuffer(entry, this.#config.addressPrefix) : null;
    }

    #setupHyperbee(store) {
        this.#bee = new Hyperbee(store.get(TRAC_NAMESPACE), {
            extension: false,
            keyEncoding: HYPERBEE_KEY_ENCODING,
            valueEncoding: HYPERBEE_VALUE_ENCODING,
        })
        return this.#bee;
    }

    async getSignedConsensusConfig() {
        const currentConfigPointer = await this.getSigned(EntryType.CONSENSUS_CONFIG_CURRENT);
        if (_.isNil(currentConfigPointer)) return null;

        if (!b4a.isBuffer(currentConfigPointer) || currentConfigPointer.length !== 4) {
            throw new Error('Invalid current consensus config pointer.');
        }

        const currentConfigIndex = currentConfigPointer.readUInt32BE(0);

        const encodedConsensusConfig = await this.getSigned(EntryType.CONSENSUS_CONFIG_RECORD + currentConfigIndex);
        if (_.isNil(encodedConsensusConfig)) {
            throw new Error(`Consensus config record ${currentConfigIndex} does not exist.`);
        }

        const consensusConfig = decodeConsensusConfig(encodedConsensusConfig);
        const schemaVersion = consensusConfig.sv.readUInt8(0);
        switch (schemaVersion) {
            case ConsensusConfigSchemaVersion.VDF_V1: {
                const decodedVdfConfig = decodeVdfConfig(consensusConfig.cd);
                return {
                    schemaVersion,
                    configData: {
                        difficulty: decodedVdfConfig.difficulty.readUInt32BE(0),
                        discriminantBitSize: decodedVdfConfig.discriminantBitSize.readUInt16BE(0),
                    }
                };
            }
            default:
                throw new Error(`Unsupported consensus config schema version: ${schemaVersion}.`);
        }
    }

    async requireSignedConsensusConfig() {
        const consensusConfig = await this.getSignedConsensusConfig();
        if (_.isNil(consensusConfig)) {
            throw new Error('Consensus config is not initialized.');
        }
        return consensusConfig;
    }
}

export default State;
