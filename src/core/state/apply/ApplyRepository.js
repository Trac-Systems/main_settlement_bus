import b4a from 'b4a';
import {
    EntryType,
    ConsensusConfigSchemaVersion,
    VDF_PROOF_BYTE_LENGTHS,
} from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import {
} from '../../../codecs/apply/applyOperationCodec.js';
import {
    isZeroBuffer,
    safeWriteUInt32BE,
    deepCopyBuffer,
    safeReadUint8,
} from '../../../utils/buffer.js';
import lengthEntryUtils from '../utils/lengthEntry.js';
import {
    safeDecodeVdfConfig,
} from '../../../codecs/consensus/v1/vdfConfigCodec.js';

class ApplyRepository {
    isAdmin(adminEntry, node) {
        if (!adminEntry || !node) return false;
        return b4a.equals(adminEntry.wk, node.from.key);
    }

    async getEntry(key, batch) {
        const entry = await batch.get(key);
        return deepCopyBuffer(entry?.value)
    }

    async getDeploymentEntry(key, batch) {
        const entry = await batch.get(EntryType.DEPLOYMENT + key);
        return deepCopyBuffer(entry?.value)
    }

    async getIndexerSequenceState(base) {
        try {
            const buf = [];
            for (const indexer of Object.values(base.system.indexers)) {
                buf.push(indexer.key);
            }
            return await tracCryptoApi.hash.blake3Safe(b4a.concat(buf));
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async isWriterKeyInIndexerList(wk, base) {
        try {
            return Object.values(base.system.indexers).some(entry => b4a.equals(entry.key, wk));
        } catch (error) {
            console.error(error);
            return null
        }
    }

    /**
     * Retrieves the address assigned to a given writing key from the registry.
     *
     * @param {Object} batch - The current Hyperbee batch instance used for reading state.
     * @param {string} writingKey - The writing key in hex string format.
     * @returns {Buffer|null} The address buffer assigned to the writing key, or null if not registered.
     */
    async getRegisteredWriterKey(batch, writingKey) {
        const entry = await batch.get(EntryType.WRITER_ADDRESS + writingKey);
        return deepCopyBuffer(entry?.value)
    }

    async isInitalizationDisabled(batch) {
        // Retrieve the flag to verify if initialization is allowed
        let initialization = await this.getEntry(EntryType.INITIALIZATION, batch);
        if (initialization === null) {
            return false
        } else {
            return b4a.equals(initialization, safeWriteUInt32BE(0))
        }
    }

    async updateWritersIndex(batch) {
        // Retrieve and increment the writers length entry
        let length = await this.getEntry(EntryType.WRITERS_LENGTH, batch);
        let incrementedLength = null;
        if (length === null) {
            // Initialize the writers length entry if it does not exist
            const bufferedLength = lengthEntryUtils.init(0);
            length = lengthEntryUtils.decodeBE(bufferedLength);
            incrementedLength = lengthEntryUtils.incrementBE(length);
        } else {
            // Decode and increment the existing writers length entry
            length = lengthEntryUtils.decodeBE(length);
            incrementedLength = lengthEntryUtils.incrementBE(length);
        }

        return { length, incrementedLength }
    }

    async getLicenseCount(batch) {
        return await this.getEntry(EntryType.LICENSE_COUNT, batch)
    }

    async assignNewLicense(batch) {
        let licenseCount = await this.getLicenseCount(batch)
        let newLicenseLength;
        if (licenseCount === null) {
            // Initialize the writers length entry if it does not exist
            const bufferedLength = lengthEntryUtils.init(0);
            licenseCount = lengthEntryUtils.decodeBE(bufferedLength);
            newLicenseLength = lengthEntryUtils.incrementBE(licenseCount);
        } else {
            // Decode and increment the existing writers length entry
            licenseCount = lengthEntryUtils.decodeBE(licenseCount);
            newLicenseLength = lengthEntryUtils.incrementBE(licenseCount);
        }
        const decodedNewLicenseLength = lengthEntryUtils.decodeBE(newLicenseLength);

        return { newLicenseLength, decodedNewLicenseLength };
    }

    validateConsensusConfig(consensusConfig) {
        let isValid =  false
        const schemaVersion = safeReadUint8(consensusConfig.sv);

        if (schemaVersion ===  null) {
            return isValid;
        }

        switch (schemaVersion) {
            case ConsensusConfigSchemaVersion.VDF_V1: {
                const configData = safeDecodeVdfConfig(consensusConfig.cd);
                const discriminantBitSize = configData?.discriminantBitSize.readUInt16BE(0);
                if (
                    configData !== null &&
                    !isZeroBuffer(configData.difficulty) &&
                    Object.hasOwn(VDF_PROOF_BYTE_LENGTHS, discriminantBitSize)
                ) {
                    isValid = true;
                }
                break;
            }
            default:
                break;
        }
        return isValid;
    }
}

export default ApplyRepository;
