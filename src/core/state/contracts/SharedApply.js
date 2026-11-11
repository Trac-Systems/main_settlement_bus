import b4a from 'b4a';
import { CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH, ConsensusVersion, EntryType, VDF_PROOF_BYTE_LENGTHS } from '../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import { deepCopyBuffer, isBufferValid, isZeroBuffer, NULL_BUFFER, safeReadUint8, safeWriteUInt32BE } from '../../../utils/buffer.js';
import { safeDecodeVdfConfig } from '../../../codecs/consensus/v1/vdfConfigCodec.js';
import addressUtils from '../utils/address.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeEntryUtils, { NODE_ENTRY_SIZE } from '../utils/nodeEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import lengthEntryUtils from '../utils/lengthEntry.js';
import { BALANCE_FEE, BALANCE_TO_STAKE, BALANCE_ZERO, toBalance, toTerm } from '../utils/balance.js';

export const sharedApply = baseState => class extends baseState {

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

    _isAdminApply(adminEntry, node) {
        if (!adminEntry || !node) return false;
        return b4a.equals(adminEntry.wk, node.from.key);
    }

    async _getEntryApply(key, batch) {
        const entry = await batch.get(key);
        return deepCopyBuffer(entry?.value)
    }

    async _getDeploymentEntryApply(key, batch) {
        const entry = await batch.get(EntryType.DEPLOYMENT + key);
        return deepCopyBuffer(entry?.value)
    }

    async _getIndexerSequenceStateApply(base) {
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

    async _isWriterKeyInIndexerListApply(wk, base) {
        try {
            return Object.values(base.system.indexers).some(entry => b4a.equals(entry.key, wk));
        } catch (error) {
            console.error(error);
            return null
        }
    }

    async _isValidatorValidApply(validatorEntryBuffer, node, op) {
        // TODO: Maybe we should transfer all validator checks to this function (address, pubKey, signature, etc)
        if (validatorEntryBuffer === null) {
            this._safeLogApply(op.type, "Incoming validator entry is null.", node.from.key)
            return false;
        };

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (decodedValidatorEntry === null) {
            this._safeLogApply(op.type, "Failed to decode validator entry.", node.from.key)
            return false;
        };

        // validator must be active writer
        if (!decodedValidatorEntry.isWriter) {
            this._safeLogApply(op.type, "Operation validator is not active", node.from.key)
            return false;
        };

        // The autobase payload should be appended by the node that signed the partial operation.
        const validatorWk = decodedValidatorEntry.wk;
        if (!b4a.equals(validatorWk, node.from.key)) {
            this._safeLogApply(op.type, "Validator cannot be the same as requester.", node.from.key)
            return false;
        }
        return true;
    }

    /**
     * Retrieves the address assigned to a given writing key from the registry.
     *
     * @param {Object} batch - The current Hyperbee batch instance used for reading state.
     * @param {string} writingKey - The writing key in hex string format.
     * @returns {Buffer|null} The address buffer assigned to the writing key, or null if not registered.
     */
    async _getRegisteredWriterKeyApply(batch, writingKey) {
        const entry = await batch.get(EntryType.WRITER_ADDRESS + writingKey);
        return deepCopyBuffer(entry?.value)
    }

    async _isApplyInitalizationDisabled(batch) {
        // Retrieve the flag to verify if initialization is allowed
        let initialization = await this._getEntryApply(EntryType.INITIALIZATION, batch);
        if (initialization === null) {
            return false
        } else {
            return b4a.equals(initialization, safeWriteUInt32BE(0))
        }
    }

    async _updateWritersIndex(batch) {
        // Retrieve and increment the writers length entry
        let length = await this._getEntryApply(EntryType.WRITERS_LENGTH, batch);
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

    _safeLogApply(operationType = "Common", errorMessage, writingKey = null) {
        if (!this._config.enableErrorApplyLogs) return;
        try {
            const date = new Date().toISOString();
            const wk = writingKey ? writingKey.toString('hex') : 'N/A';
            console.error(`[${date}][${operationType}][${errorMessage}][${wk}]`);
        } catch (e) {
            console.error(`[LOG_ERROR][Failed to log error][${e}]`);
        }
    }

    _stakeBalanceApply(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this._safeLogApply("StakeBalance", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this._safeLogApply("StakeBalance", "Failed to decode node entry", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this._safeLogApply("StakeBalance", "Invalid node balance", node.from.key);
            return null;
        }

        if (!currentNodeBalance.greaterThanOrEquals(BALANCE_TO_STAKE)) {
            this._safeLogApply("StakeBalance", "Insufficient balance to stake", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.sub(BALANCE_TO_STAKE);
        if (newNodeBalance === null) {
            this._safeLogApply("StakeBalance", "Failed to subtract stake balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this._safeLogApply("StakeBalance", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_TO_STAKE.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this._safeLogApply("StakeBalance", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;
    }

    _withdrawStakedBalanceApply(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this._safeLogApply("withdrawStakedBalanceApply", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this._safeLogApply("withdrawStakedBalanceApply", "Failed to decode node entry", node.from.key);
            return null;
        }

        const stakedBalance = toBalance(decodedNodeEntry.stakedBalance);
        if (stakedBalance === null) {
            this._safeLogApply("withdrawStakedBalanceApply", "Invalid staked balance", node.from.key);
            return null;
        }

        if (!stakedBalance.greaterThan(BALANCE_ZERO)) {
            this._safeLogApply("withdrawStakedBalanceApply", "No staked balance to unstake", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this._safeLogApply("withdrawStakedBalanceApply", "Invalid current balance", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.add(stakedBalance);
        if (newNodeBalance === null) {
            this._safeLogApply("withdrawStakedBalanceApply", "Failed to add staked balance to current balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this._safeLogApply("withdrawStakedBalanceApply", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this._safeLogApply("withdrawStakedBalanceApply", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;

    }

    async _validatorPenaltyApply(writingKeyBuffer, batch, base, invalidOperations) {
        const adminEntryBuffer = await this._getEntryApply(EntryType.ADMIN, batch);
        if (adminEntryBuffer === null) {
            this._safeLogApply("ValidatorPenalty", "Admin entry not found", writingKeyBuffer);
            return;
        }
        const adminEntry = adminEntryUtils.decode(adminEntryBuffer, this._config.addressPrefix);
        if (adminEntry === null) {
            this._safeLogApply("ValidatorPenalty", "Failed to decode admin entry", writingKeyBuffer);
            return;
        }

        if (b4a.equals(adminEntry.wk, writingKeyBuffer)) {
            this._safeLogApply("ValidatorPenalty", "Admin cannot be penalized", writingKeyBuffer);
            return;
        }

        // In theory, none of the negative cases in the if-statements should occur. They are added only for safety reasons.
        const validatorWk = writingKeyBuffer.toString('hex');

        const validatorAddressBuffer = await this._getRegisteredWriterKeyApply(batch, validatorWk);
        if (validatorAddressBuffer === null) {
            this._safeLogApply("ValidatorPenalty", `No validator found for writing key: ${validatorWk}`, writingKeyBuffer);
            return;
        }

        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this._config.addressPrefix);
        if (validatorAddressString === null) {
            this._safeLogApply("ValidatorPenalty", `Invalid validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this._safeLogApply("ValidatorPenalty", `Failed to decode validator public key: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorNodeEntryBuffer = await this._getEntryApply(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this._safeLogApply("ValidatorPenalty", `No node entry found for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const decodedValidatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (decodedValidatorNodeEntry === null) {
            this._safeLogApply("ValidatorPenalty", `Failed to decode validator node entry for address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const stakedBalance = toBalance(decodedValidatorNodeEntry.stakedBalance);

        if (stakedBalance === null) {
            this._safeLogApply("ValidatorPenalty", `Invalid staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const penalty = BALANCE_FEE.mul(toTerm(BigInt(invalidOperations)));

        if (penalty === null) {
            this._safeLogApply("ValidatorPenalty", `Failed to calculate penalty for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const deductedStakedBalance = penalty.greaterThanOrEquals(stakedBalance) ? BALANCE_ZERO : stakedBalance.sub(penalty);

        if (deductedStakedBalance === null) {
            this._safeLogApply("ValidatorPenalty", `Failed to subtract penalty from staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        if (deductedStakedBalance.greaterThan(BALANCE_ZERO)) {

            const currentBalance = toBalance(decodedValidatorNodeEntry.balance);
            if (currentBalance === null) {
                this._safeLogApply("ValidatorPenalty", `Invalid balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const newBalance = currentBalance.add(deductedStakedBalance);
            if (newBalance === null) {
                this._safeLogApply("ValidatorPenalty", `Failed to add remaining staked balance to balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithBalance = newBalance.update(validatorNodeEntryBuffer);
            if (updatedNodeEntryWithBalance === null) {
                this._safeLogApply("ValidatorPenalty", `Failed to update node entry with new balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
            if (updatedNodeEntryWithAllBalances === null) {
                this._safeLogApply("ValidatorPenalty", `Failed to update node entry with new staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryWithAllBalances, nodeRoleUtils.NodeRole.WHITELISTED);

            if (downgradedNodeEntry === null) {
                this._safeLogApply("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            await base.removeWriter(writingKeyBuffer);
            await batch.put(validatorAddressString, downgradedNodeEntry);

            return;

        } else {
            const updatedNodeEntryZeroStakedBalance = nodeEntryUtils.setStakedBalance(validatorNodeEntryBuffer, BALANCE_ZERO.value);
            if (updatedNodeEntryZeroStakedBalance === null) {
                this._safeLogApply("ValidatorPenalty", `Failed to update node entry with new staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryZeroStakedBalance, nodeRoleUtils.NodeRole.WHITELISTED);
            if (downgradedNodeEntry === null) {
                this._safeLogApply("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            await base.removeWriter(writingKeyBuffer);
            await batch.put(validatorAddressString, downgradedNodeEntry);

            return;
        }
    }

    async _applyGetLicenseCount(batch) {
        return await this._getEntryApply(EntryType.LICENSE_COUNT, batch)
    }

    async _applyAssignNewLicense(batch) {
        let licenseCount = await this._applyGetLicenseCount(batch)
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
};
