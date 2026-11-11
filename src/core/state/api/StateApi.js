import b4a from 'b4a';
import { CONSENSUS_CONFIG_INDEX_SIZE, EntryType, EPOCH_BYTE_LENGTH, HASH_BYTE_LENGTH } from '../../../utils/constants.js';
import { isHexString, isTransactionRecordPut, sleep } from '../../../utils/helpers.js';
import tracCryptoApi from 'trac-crypto-api';
import { isBufferValid, safeWriteUInt32BE } from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeEntryUtils from '../utils/nodeEntry.js';
import lengthEntryUtils from '../utils/lengthEntry.js';
import transactionUtils from '../utils/transaction.js';
import remote from 'hypercore/lib/fully-remote-proof.js';
import { decodeVersionedConsensusConfig } from '../../../utils/consensusConfig.js';
import { readEpochAppenderSelectionContext, readEpochAppendOutcome } from '../../consensus/epochAppenderSelection/epochAppenderSelectionLedgerReader.js';
import _ from 'lodash';

export const stateApi = baseState => class extends baseState {

    isWritable() {
        return this._base.writable;
    }

    isIndexer() {
        return this._base.isIndexer;
    }

    async indexerCount() {
        return (await this.getIndexersEntry()).length;
    }

    getUnsignedLength() {
        return this._base.view.core.length;
    }

    getSignedLength() {
        return this._base.view.core.signedLength;
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

    async getCurrentEpochUnsigned() {
        const currentEpoch = await this.get(EntryType.EPOCH_CURRENT);
        return isBufferValid(currentEpoch, EPOCH_BYTE_LENGTH) ? currentEpoch.readBigUInt64BE(0) : null;
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
     * Reads the encoded epoch record stored under `/epochHash/<epochHash>`.
     * Decode its { sv, data } envelope with decodeEpochRecord, then decode data
     * according to the stored sv, not the currently active consensus version.
     *
     * @param {Buffer|string} epochHash Epoch hash as a buffer or hex string.
     * @returns {Promise<Buffer|null>} Encoded epoch record, or `null` when it is not stored.
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
     * Reads the required encoded { sv, data } epoch record under `/epochHash/<epochHash>`.
     *
     * @param {Buffer|string} epochHash Epoch hash as a buffer or hex string.
     * @returns {Promise<Buffer>} Encoded epoch record.
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
        const result = await this._base.view.get(key);
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

    /**
     * Reads a value from the view checked out at the current signed length.
     * Consensus channel admission uses { wait: false, update: false } to avoid
     * waiting for replication while deciding whether to open the channel.
     *
     * @param {string|Buffer} key Entry key.
     * @param {object} [options={}] Read options forwarded to Hyperbee.
     * @param {boolean} [options.wait=true] Wait for missing blocks to be replicated.
     *   When false, a missing block causes an error rather than waiting.
     * @param {boolean} [options.update=true] Allow Hyperbee to update an empty view before reading.
     * @returns {Promise<Buffer|null>} Stored value, or null if the key does not exist.
     */
    async getSigned(key, options = {}) {
        const view_session = this._base.view.checkout(this._base.view.core.signedLength);
        try {
            const result = await view_session.get(key, options);
            return result ? result.value : null;
        } finally {
            await view_session.close();
        }
    }

    async getAdminEntry() {
        const adminEntry = await this.getSigned(EntryType.ADMIN);
        return adminEntry ? adminEntryUtils.decode(adminEntry, this._config.addressPrefix) : null;
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
        return !!adminEntry && this._wallet?.address === adminEntry?.address && b4a.equals(adminEntry?.wk, this.writingKey)
    }

    async isAdminAddress(targetAddress) {
        const adminEntry = await this.getAdminEntry();
        return (adminEntry?.address === targetAddress);
    }

    async isAdminAllowedToValidate() {
        if (!this.isWritable() || !this.isIndexer() || !await this.isAdmin()) return false;
        const activeWriters = await this.getActiveWriterCount(true);
        return activeWriters < this._config.maxWritersForAdminIndexerConnection;
    }

    /**
     * Checks a remote validator against the current local view, including pending
     * role changes. Cached discovery and established transports do not grant a role.
     */
    async isValidatorAddress(address) {
        const entry = await this.getNodeEntryUnsigned(address);
        if (!entry?.isWriter) return false;
        if (!entry.isIndexer) {
            const signedEntry = await this.getNodeEntry(address);
            return !!signedEntry?.isWriter && !signedEntry.isIndexer;
        }

        const admin = await this.getAdminEntry();
        if (address !== admin?.address || !entry.wk || !admin.wk || !b4a.equals(entry.wk, admin.wk)) return false;
        return await this.getActiveWriterCount(true) < this._config.maxWritersForAdminIndexerConnection;
    }

    async isAddressWhitelisted(address) {
        const nodeEntry = await this.getNodeEntry(address);
        if (nodeEntry === null) return false;
        return !!nodeEntry.isWhitelisted;
    }

    async getIndexersEntry() {
        return Object.values(this._base.system.indexers);
    }

    /**
     * Checks whether a bech32m address belongs to a registered indexer.
     * @param {string} targetAddress Address to check.
     * @param {object} [options] Hyperbee read options, e.g. `wait: false` for channel admission.
     * @returns {Promise<boolean>} True when the address belongs to an indexer in signed state.
     */
    async isIndexerAddress(targetAddress, options) {
        const targetAddressBuffer = addressUtils.addressToBuffer(targetAddress, this._config.addressPrefix);
        if (targetAddressBuffer.length === 0) return false;
        const entries = await this.getIndexersEntry();
        for (const entry of entries) {
            const address = await this.getSigned(EntryType.WRITER_ADDRESS + b4a.toString(entry.key, 'hex'), options);
            if (address && b4a.equals(targetAddressBuffer, address)) return true;
        }
        return false;
    }

    async getActiveWriterCount(excludeAdmin = false) {
        const cached = this._activeWriterCountCache.get(excludeAdmin);
        const systemLength = this._base.system?.core?.length ?? -1;

        if (cached && cached.systemLength === systemLength) {
            return cached.value;
        }

        const activeAddresses = new Set();
        const adminAddress = (await this.getAdminEntry())?.address ?? null;

        // sometimes autobase swaps _applyState while performing a bump which will generate the system to be "empty" (it is just a proxy getter to applyState with a null check).
        // since this thing is responsible for permissions, it was opted out to perform a realignment check prior instead of safe navigating to respond the query (especially given that there is a cache in place).
        await this.refresh()

        for await (const { key, value } of this._base.system.list()) {
            if (!key || !value || value.isRemoved) continue;

            const writerKeyHex = key.toString('hex');
            const addressBuffer = await this.getRegisteredWriterKey(writerKeyHex);
            if (!addressBuffer) continue;

            const address = addressUtils.bufferToAddress(addressBuffer, this._config.addressPrefix);
            if (!address) continue;

            // Non-admin indexers do not participate in validator capacity decisions.
            if (value.isIndexer && address !== adminAddress) continue;
            if (excludeAdmin && address === adminAddress) continue;

            activeAddresses.add(address);
        }

        const count = activeAddresses.size;
        this._activeWriterCountCache.set(excludeAdmin, { systemLength, value: count });
        return count;
    }

    async refresh() {
        return await this._base.update()
    }

    /**
     * Publishes apply events after the related state changes become signed.
     * The optional length is used by tests which provide their own Autobase instance.
     *
     * @param {number} signedLength current signed view length
     */
    handleViewUpdate(signedLength = this.getSignedLength()) {
        this._stateEventQueue.flush(signedLength, (event, ...args) => {
            this._emitEvent(event, ...args);
        });
    }

    async isWkInIndexersEntry(wk) {
        if (wk === null) return false;
        return Object.values(this._base.system.indexers)
            .some(entry => b4a.equals(entry.key, wk));
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
        return address ? addressUtils.bufferToAddress(address, this._config.addressPrefix) : null;
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
        return this._writeQueue.add(() => this._base.append(payload));
    }

    async appendWithProofOfPublication(batch, batchTxHashes) {
        return this._writeQueue.add(async () => {

            const core = this._base.local;
            const end = await this._base.append(batch);
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
        const out = await remote.verify(this._store.storage, proof);
        if (!out) throw new Error('Proof of publication verification failed');
        return out;
    }

    async getIndexerSequenceState() {
        const buf = []
        for (const indexer of Object.values(this._base.system.indexers)) {
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

        const snapshot = this._base.view.checkout(this.getSignedLength());
        try {
            const entry = await snapshot.get(hash);
            return entry ? entry.seq : null;
        } finally {
            await snapshot.close();
        }
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

        const historyStream = this._base.view.createHistoryStream({
            gte: startSeq,
            lte: endSeq
        });

        let hashes = [];
        for await (const entry of historyStream) {
            if (isTransactionRecordPut(entry)) {
                hashes.push({ hash: entry.key, confirmed_length: entry.seq });
            } else if (entry.type === 'put' && entry.key.startsWith(EntryType.EPOCH_HASH)) {
                // Epoch records share this history, but have their own key namespace.
                const hash = entry.key.slice(EntryType.EPOCH_HASH.length);
                if (hash.length === HASH_BYTE_LENGTH * 2 && isHexString(hash)) {
                    hashes.push({ hash, confirmed_length: entry.seq });
                }
            }
        }

        return hashes;
    }

    async getRegisteredWriterKey(writingKey) {
        const entry = await this.get(EntryType.WRITER_ADDRESS + writingKey);
        return entry ? addressUtils.addressToBuffer(entry, this._config.addressPrefix) : null;
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

        return decodeVersionedConsensusConfig(encodedConsensusConfig);
    }

    async requireSignedConsensusConfig() {
        const consensusConfig = await this.getSignedConsensusConfig();
        if (_.isNil(consensusConfig)) {
            throw new Error('Consensus config is not initialized.');
        }
        return consensusConfig;
    }

    /** @returns {Promise<import('../../consensus/epochAppenderSelection/epochAppenderSelectionState.js').EpochAppenderSelectionContext>} Signed arbitration context. */
    getEpochAppenderSelectionContext() {
        return readEpochAppenderSelectionContext(this._base, this._config);
    }

    /**
     * @param {import('../../consensus/epochAppenderSelection/epochAppenderSelectionState.js').EpochAppendPublication} publication
     * @returns {Promise<import('../../consensus/epochAppenderSelection/epochAppenderSelectionState.js').EpochAppendOutcomeResult>}
     */
    getEpochAppendOutcome(publication) {
        return readEpochAppendOutcome(this._base, publication);
    }

    /** Authorizes the epoch append inside the writer queue before writing to Autobase. */
    appendEpoch(payload, authorizeEpochAppend) {
        return this._writeQueue.add(async () => {
            await authorizeEpochAppend({
                writerKey: this._base.local.key.toString('hex'),
                from: this._base.local.length,
            });
            return this._base.append(payload);
        });
    }

    async getUnsignedConsensusConfig() {
        // Keep the pointer and record in the same view while unsigned state can change.
        const snapshot = this._base.view.snapshot();
        try {
            const currentConfigPointer = (await snapshot.get(EntryType.CONSENSUS_CONFIG_CURRENT))?.value;
            if (_.isNil(currentConfigPointer)) return null;

            if (!b4a.isBuffer(currentConfigPointer) || currentConfigPointer.length !== CONSENSUS_CONFIG_INDEX_SIZE) {
                throw new Error('Invalid current consensus config pointer.');
            }

            const currentConfigIndex = currentConfigPointer.readUInt32BE(0);
            const encodedConsensusConfig = (await snapshot.get(EntryType.CONSENSUS_CONFIG_RECORD + currentConfigIndex))?.value;
            if (_.isNil(encodedConsensusConfig)) {
                throw new Error(`Consensus config record ${currentConfigIndex} does not exist.`);
            }

            return decodeVersionedConsensusConfig(encodedConsensusConfig);
        } finally {
            await snapshot.close();
        }
    }
};
