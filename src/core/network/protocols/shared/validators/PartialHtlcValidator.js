import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import PartialOperationValidator from './PartialOperationValidator.js';
import {bufferToAddress} from '../../../../state/utils/address.js';
import {BALANCE_FEE, PERCENT_75, toBalance} from '../../../../state/utils/balance.js';
import * as escrowEntryUtils from '../../../../state/utils/escrowEntry.js';
import {bufferToBigInt} from '../../../../../utils/amountSerialization.js';
import {isZeroBuffer, uint64ToBuffer} from '../../../../../utils/buffer.js';
import {
    HTLC_MIN_LOCK_DURATION_EPOCHS,
    EntryType,
    OperationType,
    PUBLIC_KEY_LENGTH,
    ResultCode
} from '../../../../../utils/constants.js';
import {verifyOrderedHtlcCosignerSignatures} from '../../../../../utils/htlcLock.js';
import {V1ProtocolError} from '../../v1/V1ProtocolError.js';

class PartialHtlcValidator extends PartialOperationValidator {
    #config;
    #selfAddress;

    constructor(state, selfAddress, config) {
        super(state, selfAddress, config);
        this.#config = config;
        this.#selfAddress = selfAddress;
    }

    async validate(payload) {
        if (payload?.type === OperationType.HTLC_REFUND) {
            throw new V1ProtocolError(
                ResultCode.OPERATION_TYPE_UNKNOWN,
                'HTLC refund validation is not implemented.'
            );
        }
        if (payload?.type === OperationType.HTLC_CLAIM) {
            return this.#validateClaim(payload);
        }
        this.isPayloadSchemaValid(payload);
        this.validateNoSelfValidation(payload);
        this.validateRequesterAddress(payload);
        await this.validateTransactionUniqueness(payload);
        await this.#validateEscrowUniqueness(payload.hlo.tx);
        await this.validateSignature(payload);
        await this.validateTransactionValidity(payload);
        this.isOperationNotCompleted(payload);

        this.#validateSettlementAddresses(payload.hlo);
        this.#validateLockAuthorizations(payload);
        await this.#validateRefundEpoch(payload.hlo);
        await this.#validateLockerBalance(payload);
        await this.#validateValidatorRewardBalance();

        return true;
    }

    async #validateClaim(payload) {
        this.isPayloadSchemaValid(payload);
        this.validateNoSelfValidation(payload);
        this.validateRequesterAddress(payload);
        await this.validateTransactionUniqueness(payload);
        await this.validateSignature(payload);
        await this.validateTransactionValidity(payload);
        this.isOperationNotCompleted(payload);

        const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(payload.hco.li, 'hex');
        const signedEscrowBuffer = await this.state.getSigned(escrowKey);
        const signedEscrow = escrowEntryUtils.decode(signedEscrowBuffer, this.#config.addressPrefix);
        if (!signedEscrow || !b4a.equals(signedEscrow.lockId, payload.hco.li)) {
            throw new V1ProtocolError(ResultCode.TX_INVALID_PAYLOAD, 'HTLC lock is not confirmed in signed state.');
        }
        if (signedEscrow.status !== escrowEntryUtils.Status.PENDING) {
            throw new V1ProtocolError(ResultCode.TX_ALREADY_EXISTS, 'HTLC escrow is already settled.');
        }

        const escrowBuffer = await this.state.get(escrowKey);
        const escrow = escrowEntryUtils.decode(escrowBuffer, this.#config.addressPrefix);
        if (!escrow || !b4a.equals(escrow.lockId, payload.hco.li)) {
            throw new V1ProtocolError(ResultCode.TX_INVALID_PAYLOAD, 'HTLC escrow does not exist or is invalid.');
        }
        if (escrow.status !== escrowEntryUtils.Status.PENDING) {
            throw new V1ProtocolError(ResultCode.TX_ALREADY_EXISTS, 'HTLC escrow is already settled.');
        }

        const [signedEpoch, unsignedEpoch] = await Promise.all([
            this.state.getCurrentEpoch(),
            this.state.getCurrentEpochUnsigned()
        ]);
        if (typeof signedEpoch !== 'bigint' || typeof unsignedEpoch !== 'bigint') {
            throw new V1ProtocolError(ResultCode.TX_INVALID_PAYLOAD, 'HTLC claim requires an initialized network epoch.');
        }
        const currentEpoch = signedEpoch > unsignedEpoch ? signedEpoch : unsignedEpoch;
        if (currentEpoch >= escrow.refundEpoch.readBigUInt64BE(0)) {
            throw new V1ProtocolError(ResultCode.TX_EXPIRED, 'HTLC claim window has expired.');
        }

        const settlement = escrowEntryUtils.makeClaim(
            escrowBuffer,
            payload.hco.pi,
            uint64ToBuffer(currentEpoch),
            this.#config.addressPrefix
        );
        if (!settlement) {
            throw new V1ProtocolError(ResultCode.TX_INVALID_PAYLOAD, 'HTLC claim preimage is invalid.');
        }
        await this.#validateClaimRecipientBalances(settlement);
        return true;
    }

    async #validateClaimRecipientBalances(settlement) {
        const credits = new Map();
        for (const [addressBytes, amount] of [
            [settlement.address, settlement.amount],
            [settlement.additionalFeeRecipientAddress, settlement.additionalFeeAmount]
        ]) {
            if (addressBytes === null) continue;
            const address = bufferToAddress(addressBytes, this.#config.addressPrefix);
            const credit = amount?.asBigInt();
            if (address === null || typeof credit !== 'bigint') {
                throw new V1ProtocolError(ResultCode.TX_INVALID_PAYLOAD, 'HTLC settlement recipient or amount is invalid.');
            }
            credits.set(address, (credits.get(address) ?? 0n) + credit);
        }

        for (const [address, credit] of credits) {
            const recipient = await this.state.getNodeEntryUnsigned(address);
            if (!recipient) continue;
            const balance = toBalance(recipient.balance);
            if (!balance || balance.asBigInt() + credit > this.max_amount) {
                throw new V1ProtocolError(
                    ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
                    'HTLC claim would overflow a settlement recipient balance.'
                );
            }
        }
    }

    async #validateEscrowUniqueness(lockId) {
        const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(lockId, 'hex');
        if (await this.state.get(escrowKey) !== null) {
            throw new V1ProtocolError(ResultCode.TX_ALREADY_EXISTS, 'HTLC escrow already exists.');
        }
    }

    #validateSettlementAddresses(operation) {
        for (const [field, label] of [
            [operation.ca, 'claim'],
            [operation.ra, 'refund'],
            ...(operation.fr ? [[operation.fr, 'fee recipient']] : [])
        ]) {
            const address = bufferToAddress(field, this.#config.addressPrefix);
            const publicKey = address && tracCryptoApi.address.decodeSafe(address);
            if (
                !b4a.isBuffer(publicKey) ||
                publicKey.length !== PUBLIC_KEY_LENGTH ||
                isZeroBuffer(publicKey)
            ) {
                throw new V1ProtocolError(
                    ResultCode.TX_INVALID_PAYLOAD,
                    `Invalid HTLC ${label} address.`
                );
            }
        }
    }

    #validateLockAuthorizations(payload) {
        const operation = payload.hlo;
        const lockerAddress = bufferToAddress(payload.address, this.#config.addressPrefix);
        const lockerPublicKey = tracCryptoApi.address.decodeSafe(lockerAddress);
        if (!b4a.equals(lockerPublicKey, operation.ss[0])) {
            throw new V1ProtocolError(
                ResultCode.TX_SIGNATURE_INVALID,
                'HTLC signer zero must be the locker identified by the operation address.'
            );
        }

        if (!verifyOrderedHtlcCosignerSignatures(operation.cs, operation.tx, operation.ss)) {
            throw new V1ProtocolError(
                ResultCode.TX_SIGNATURE_INVALID,
                'HTLC cosigner signatures are invalid or not in signer-set order.'
            );
        }
    }

    async #validateRefundEpoch(operation) {
        const [signedEpoch, unsignedEpoch] = await Promise.all([
            this.state.getCurrentEpoch(),
            this.state.getCurrentEpochUnsigned()
        ]);
        if (typeof signedEpoch !== 'bigint' || typeof unsignedEpoch !== 'bigint') {
            throw new V1ProtocolError(
                ResultCode.TX_INVALID_PAYLOAD,
                'HTLC locks require an initialized network epoch.'
            );
        }

        const currentEpoch = signedEpoch > unsignedEpoch ? signedEpoch : unsignedEpoch;
        const refundEpoch = b4a.from(operation.re).readBigUInt64BE(0);
        if (refundEpoch < currentEpoch + HTLC_MIN_LOCK_DURATION_EPOCHS) {
            throw new V1ProtocolError(
                ResultCode.TX_INVALID_PAYLOAD,
                `HTLC refund epoch must be at least ${HTLC_MIN_LOCK_DURATION_EPOCHS} epoch(s) after the current epoch.`
            );
        }
    }

    async #validateLockerBalance(payload) {
        const lockerAddress = bufferToAddress(payload.address, this.#config.addressPrefix);
        const lockerEntry = await this.state.getNodeEntryUnsigned(lockerAddress);
        if (!lockerEntry) {
            throw new V1ProtocolError(ResultCode.TRANSFER_SENDER_NOT_FOUND, 'HTLC locker account not found.');
        }

        const principal = bufferToBigInt(payload.hlo.am);
        const surchargeFee = bufferToBigInt(payload.hlo.fa);
        const escrowAmount = principal + surchargeFee;
        if (escrowAmount > this.max_amount || escrowAmount + this.fee > this.max_amount) {
            throw new V1ProtocolError(
                ResultCode.TRANSFER_AMOUNT_TOO_LARGE,
                'HTLC escrow amount exceeds the maximum allowed value.'
            );
        }

        if (bufferToBigInt(lockerEntry.balance) < escrowAmount + this.fee) {
            throw new V1ProtocolError(
                ResultCode.TRANSFER_INSUFFICIENT_BALANCE,
                'Insufficient balance for HTLC principal, surcharge fee, and network fee.'
            );
        }
    }

    async #validateValidatorRewardBalance() {
        const validatorEntry = await this.state.getNodeEntryUnsigned(this.#selfAddress);
        if (!validatorEntry) return;

        const reward = BALANCE_FEE.percentage(PERCENT_75);
        if (bufferToBigInt(validatorEntry.balance) + bufferToBigInt(reward.value) > this.max_amount) {
            throw new V1ProtocolError(
                ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
                'HTLC validator reward would overflow the validator balance.'
            );
        }
    }
}

export default PartialHtlcValidator;
