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
    NULL_BUFFER,
    isZeroBuffer,
    safeWriteUInt32BE,
    deepCopyBuffer,
    safeReadUint8,
} from '../../../utils/buffer.js';
import addressUtils from '../utils/address.js';
import nodeEntryUtils, { NODE_ENTRY_SIZE } from '../utils/nodeEntry.js';
import adminEntryUtils from '../utils/adminEntry.js';
import nodeRoleUtils from '../utils/roles.js';
import lengthEntryUtils from '../utils/lengthEntry.js';
import {
    BALANCE_FEE,
    toBalance,
    PERCENT_50,
    PERCENT_25,
    BALANCE_TO_STAKE,
    BALANCE_ZERO,
    toTerm,
} from '../utils/balance.js';
import { Status } from '../utils/transaction.js';
import {
    safeDecodeVdfConfig,
} from '../../../codecs/consensus/v1/vdfConfigCodec.js';



class ApplyRepository {
    #config;
    #state;

    constructor(config, state) {
        this.#config = config;
        this.#state = state;
    }

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

    async isValidatorValid(validatorEntryBuffer, node, op) {
        // TODO: Maybe we should transfer all validator checks to this function (address, pubKey, signature, etc)
        if (validatorEntryBuffer === null) {
            this.safeLog(op.type, "Incoming validator entry is null.", node.from.key)
            return false;
        };

        const decodedValidatorEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (decodedValidatorEntry === null) {
            this.safeLog(op.type, "Failed to decode validator entry.", node.from.key)
            return false;
        };

        // validator must be active writer
        if (!decodedValidatorEntry.isWriter) {
            this.safeLog(op.type, "Operation validator is not active", node.from.key)
            return false;
        };

        // The autobase payload should be appended by the node that signed the partial operation.
        const validatorWk = decodedValidatorEntry.wk;
        if (!b4a.equals(validatorWk, node.from.key)) {
            this.safeLog(op.type, "Validator cannot be the same as requester.", node.from.key)
            return false;
        }
        return true;
    }

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

    safeLog(operationType = "Common", errorMessage, writingKey = null) {
        if (!this.#config.enableErrorApplyLogs) return;
        try {
            const date = new Date().toISOString();
            const wk = writingKey ? writingKey.toString('hex') : 'N/A';
            console.error(`[${date}][${operationType}][${errorMessage}][${wk}]`);
        } catch (e) {
            console.error(`[LOG_ERROR][Failed to log error][${e}]`);
        }
    }

    stakeBalance(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this.safeLog("StakeBalance", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this.safeLog("StakeBalance", "Failed to decode node entry", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this.safeLog("StakeBalance", "Invalid node balance", node.from.key);
            return null;
        }

        if (!currentNodeBalance.greaterThanOrEquals(BALANCE_TO_STAKE)) {
            this.safeLog("StakeBalance", "Insufficient balance to stake", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.sub(BALANCE_TO_STAKE);
        if (newNodeBalance === null) {
            this.safeLog("StakeBalance", "Failed to subtract stake balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this.safeLog("StakeBalance", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_TO_STAKE.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this.safeLog("StakeBalance", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;
    }

    withdrawStakedBalance(nodeEntryBuffer, node) {
        if (!nodeEntryBuffer || nodeEntryBuffer.length === 0 || nodeEntryBuffer.length !== NODE_ENTRY_SIZE) {
            this.safeLog("withdrawStakedBalanceApply", "Invalid node entry buffer", node.from.key);
            return null;
        }

        const decodedNodeEntry = nodeEntryUtils.decode(nodeEntryBuffer);
        if (decodedNodeEntry === null) {
            this.safeLog("withdrawStakedBalanceApply", "Failed to decode node entry", node.from.key);
            return null;
        }

        const stakedBalance = toBalance(decodedNodeEntry.stakedBalance);
        if (stakedBalance === null) {
            this.safeLog("withdrawStakedBalanceApply", "Invalid staked balance", node.from.key);
            return null;
        }

        if (!stakedBalance.greaterThan(BALANCE_ZERO)) {
            this.safeLog("withdrawStakedBalanceApply", "No staked balance to unstake", node.from.key);
            return null;
        }

        const currentNodeBalance = toBalance(decodedNodeEntry.balance);
        if (currentNodeBalance === null) {
            this.safeLog("withdrawStakedBalanceApply", "Invalid current balance", node.from.key);
            return null;
        }

        const newNodeBalance = currentNodeBalance.add(stakedBalance);
        if (newNodeBalance === null) {
            this.safeLog("withdrawStakedBalanceApply", "Failed to add staked balance to current balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithBalance = newNodeBalance.update(nodeEntryBuffer);
        if (updatedNodeEntryWithBalance === null) {
            this.safeLog("withdrawStakedBalanceApply", "Failed to update node entry with new balance", node.from.key);
            return null;
        }

        const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
        if (updatedNodeEntryWithAllBalances === null) {
            this.safeLog("withdrawStakedBalanceApply", "Failed to set staked balance in node entry", node.from.key);
            return null;
        }

        return updatedNodeEntryWithAllBalances;

    }

    async validatorPenalty(writingKeyBuffer, batch, base, invalidOperations) {
        const adminEntryBuffer = await this.getEntry(EntryType.ADMIN, batch);
        if (adminEntryBuffer === null) {
            this.safeLog("ValidatorPenalty", "Admin entry not found", writingKeyBuffer);
            return;
        }
        const adminEntry = adminEntryUtils.decode(adminEntryBuffer, this.#config.addressPrefix);
        if (adminEntry === null) {
            this.safeLog("ValidatorPenalty", "Failed to decode admin entry", writingKeyBuffer);
            return;
        }

        if (b4a.equals(adminEntry.wk, writingKeyBuffer)) {
            this.safeLog("ValidatorPenalty", "Admin cannot be penalized", writingKeyBuffer);
            return;
        }

        // In theory, none of the negative cases in the if-statements should occur. They are added only for safety reasons.
        const validatorWk = writingKeyBuffer.toString('hex');

        const validatorAddressBuffer = await this.getRegisteredWriterKey(batch, validatorWk);
        if (validatorAddressBuffer === null) {
            this.safeLog("ValidatorPenalty", `No validator found for writing key: ${validatorWk}`, writingKeyBuffer);
            return;
        }

        const validatorAddressString = addressUtils.bufferToAddress(validatorAddressBuffer, this.#config.addressPrefix);
        if (validatorAddressString === null) {
            this.safeLog("ValidatorPenalty", `Invalid validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorPublicKey = tracCryptoApi.address.decodeSafe(validatorAddressString);
        if (b4a.equals(validatorPublicKey, NULL_BUFFER)) {
            this.safeLog("ValidatorPenalty", `Failed to decode validator public key: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const validatorNodeEntryBuffer = await this.getEntry(validatorAddressString, batch);
        if (validatorNodeEntryBuffer === null) {
            this.safeLog("ValidatorPenalty", `No node entry found for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const decodedValidatorNodeEntry = nodeEntryUtils.decode(validatorNodeEntryBuffer);
        if (decodedValidatorNodeEntry === null) {
            this.safeLog("ValidatorPenalty", `Failed to decode validator node entry for address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const stakedBalance = toBalance(decodedValidatorNodeEntry.stakedBalance);

        if (stakedBalance === null) {
            this.safeLog("ValidatorPenalty", `Invalid staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const penalty = BALANCE_FEE.mul(toTerm(BigInt(invalidOperations)));

        if (penalty === null) {
            this.safeLog("ValidatorPenalty", `Failed to calculate penalty for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        const deductedStakedBalance = penalty.greaterThanOrEquals(stakedBalance) ? BALANCE_ZERO : stakedBalance.sub(penalty);

        if (deductedStakedBalance === null) {
            this.safeLog("ValidatorPenalty", `Failed to subtract penalty from staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
            return;
        }

        if (deductedStakedBalance.greaterThan(BALANCE_ZERO)) {

            const currentBalance = toBalance(decodedValidatorNodeEntry.balance);
            if (currentBalance === null) {
                this.safeLog("ValidatorPenalty", `Invalid balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const newBalance = currentBalance.add(deductedStakedBalance);
            if (newBalance === null) {
                this.safeLog("ValidatorPenalty", `Failed to add remaining staked balance to balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithBalance = newBalance.update(validatorNodeEntryBuffer);
            if (updatedNodeEntryWithBalance === null) {
                this.safeLog("ValidatorPenalty", `Failed to update node entry with new balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const updatedNodeEntryWithAllBalances = nodeEntryUtils.setStakedBalance(updatedNodeEntryWithBalance, BALANCE_ZERO.value);
            if (updatedNodeEntryWithAllBalances === null) {
                this.safeLog("ValidatorPenalty", `Failed to update node entry with new staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryWithAllBalances, nodeRoleUtils.NodeRole.WHITELISTED);

            if (downgradedNodeEntry === null) {
                this.safeLog("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            await base.removeWriter(writingKeyBuffer);
            await batch.put(validatorAddressString, downgradedNodeEntry);

            return;

        } else {
            const updatedNodeEntryZeroStakedBalance = nodeEntryUtils.setStakedBalance(validatorNodeEntryBuffer, BALANCE_ZERO.value);
            if (updatedNodeEntryZeroStakedBalance === null) {
                this.safeLog("ValidatorPenalty", `Failed to update node entry with new staked balance for validator address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            const downgradedNodeEntry = nodeEntryUtils.setRole(updatedNodeEntryZeroStakedBalance, nodeRoleUtils.NodeRole.WHITELISTED);
            if (downgradedNodeEntry === null) {
                this.safeLog("ValidatorPenalty", `Failed to downgrade validator to whitelisted for address: ${validatorAddressString}`, writingKeyBuffer);
                return;
            }

            await base.removeWriter(writingKeyBuffer);
            await batch.put(validatorAddressString, downgradedNodeEntry);

            return;
        }
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

    emitEvent(event, ...args) {
        try {
            this.#state.emit(event, ...args)
        } catch (_ignored) { }
    }

    async transferFeeTxOperation(requesterAddressString, validatorAddressString, validatorEntryBuffer, subnetworkCreatorAddressString, feeAmount, batch, node) {
        if (!requesterAddressString ||
            !validatorAddressString ||
            !validatorEntryBuffer ||
            !subnetworkCreatorAddressString ||
            !feeAmount ||
            !batch ||
            !node
        ) {
            this.safeLog("transferFeeTxOperation", "Invalid incoming data.", node.from.key)
            return null;
        }

        // case when requester is also the validator is not possible.
        // charge fee from the requester
        const requesterNodeEntryBuffer = await this.getEntry(requesterAddressString, batch);
        if (requesterNodeEntryBuffer === null) {
            this.safeLog("transferFeeTxOperation", "Invalid requester node entry buffer.", node.from.key)
            return null;
        }

        const requesterNodeEntry = nodeEntryUtils.decode(requesterNodeEntryBuffer);
        if (requesterNodeEntry === null) {
            this.safeLog("transferFeeTxOperation", "Invalid requester node entry, can not to decode.", node.from.key)
            return null;
        }

        const requesterBalance = toBalance(requesterNodeEntry.balance);
        if (requesterBalance === null) {
            this.safeLog("transferFeeTxOperation", "Invalid requester balance.", node.from.key)
            return null;
        }

        if (!requesterBalance.greaterThanOrEquals(feeAmount)) {
            this.safeLog("transferFeeTxOperation", "Insufficient requester balance to pay fee.", node.from.key)
            return Status.IGNORE;
        }

        const newRequesterBalance = requesterBalance.sub(feeAmount);
        if (newRequesterBalance === null) {
            this.safeLog("transferFeeTxOperation", "Failed to deduct fee from requester balance.", node.from.key)
            return null;
        }

        const updatedRequesterNodeEntry = newRequesterBalance.update(requesterNodeEntryBuffer);
        if (updatedRequesterNodeEntry === null) {
            this.safeLog("transferFeeTxOperation", "Failed to update requester node balance.", node.from.key)
            return null;
        }

        // Validator always gets 50% of the fee by the base

        const validatorNodeEntry = nodeEntryUtils.decode(validatorEntryBuffer);
        if (validatorNodeEntry === null) {
            this.safeLog("transferFeeTxOperation", "Invalid validator node entry, can not to decode.", node.from.key)
            return null;
        }

        const validatorBalance = toBalance(validatorNodeEntry.balance);
        if (validatorBalance === null) {
            this.safeLog("transferFeeTxOperation", "Invalid validator balance.", node.from.key)
            return null;
        }

        const newValidatorBalance = validatorBalance.add(feeAmount.percentage(PERCENT_50));
        if (newValidatorBalance === null) {
            this.safeLog("transferFeeTxOperation", "Failed to add fee to validator balance.", node.from.key)
            return null;
        }

        const updatedValidatorNodeEntry = newValidatorBalance.update(validatorEntryBuffer);
        if (updatedValidatorNodeEntry === null) {
            this.safeLog("transferFeeTxOperation", "Failed to update validator node balance.", node.from.key)
            return null;
        }

        // If requester is the subnetwork creator:
        // 1. Validator got 50%
        // 2. Other 50% is burned
        // 3. No additional reward for bootstrap deployer
        if (requesterAddressString === subnetworkCreatorAddressString) {
            return {
                requesterEntry: updatedRequesterNodeEntry,
                validatorEntry: updatedValidatorNodeEntry,
                subnetworkCreatorEntry: null
            };
        }

        // If validator is also the bootstrap deployer:
        // 1. Gets 75% total (50% as validator + 25% as bootstrap deployer)
        // 2. 25% is burned
        if (validatorAddressString === subnetworkCreatorAddressString) {
            // We already added 50% as validator fee, now add only the additional 25%
            const newValidatorBalanceWithBonus = newValidatorBalance.add(feeAmount.percentage(PERCENT_25));
            if (newValidatorBalanceWithBonus === null) {
                this.safeLog("transferFeeTxOperation", "Failed to add bonus fee to validator balance.", node.from.key)
                return null;
            }

            const updatedValidatorNodeEntryWithBonus = newValidatorBalanceWithBonus.update(validatorEntryBuffer);
            if (updatedValidatorNodeEntryWithBonus === null) {
                this.safeLog("transferFeeTxOperation", "Failed to update validator node balance with bonus.", node.from.key)
                return null;
            }

            return {
                requesterEntry: updatedRequesterNodeEntry,
                validatorEntry: updatedValidatorNodeEntryWithBonus,
                subnetworkCreatorEntry: null
            };
        }

        // Normal case (validator is not the bootstrap deployer):
        // 1. Validator got 50%
        // 2. Bootstrap deployer gets 25%
        // 3. 25% is burned
        const subnetworkCreatorNodeEntryBuffer = await this.getEntry(subnetworkCreatorAddressString, batch);
        if (subnetworkCreatorNodeEntryBuffer === null) {
            this.safeLog("transferFeeTxOperation", "Invalid subnetwork creator -  it does not exists", node.from.key)
            return null;
        }

        const subnetworkCreatorNodeEntry = nodeEntryUtils.decode(subnetworkCreatorNodeEntryBuffer);
        if (subnetworkCreatorNodeEntry === null) {
            this.safeLog("transferFeeTxOperation", "Invalid subnetwork creator node entry, can not to decode.", node.from.key)
            return null;
        }

        const subnetworkCreatorBalance = toBalance(subnetworkCreatorNodeEntry.balance);
        if (subnetworkCreatorBalance === null) {
            this.safeLog("transferFeeTxOperation", "Invalid subnetwork creator balance.", node.from.key)
            return null;
        }

        const newSubnetworkCreatorBalance = subnetworkCreatorBalance.add(feeAmount.percentage(PERCENT_25));
        if (newSubnetworkCreatorBalance === null) {
            this.safeLog("transferFeeTxOperation", "Failed to add fee to subnetwork creator balance.", node.from.key)
            return null;
        }

        const updatedSubnetworkCreatorNodeEntry = newSubnetworkCreatorBalance.update(subnetworkCreatorNodeEntryBuffer);
        if (updatedSubnetworkCreatorNodeEntry === null) {
            this.safeLog("transferFeeTxOperation", "Failed to update subnetwork creator node balance.", node.from.key)
            return null;
        }

        return {
            requesterEntry: updatedRequesterNodeEntry,
            validatorEntry: updatedValidatorNodeEntry,
            subnetworkCreatorEntry: updatedSubnetworkCreatorNodeEntry
        };
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
