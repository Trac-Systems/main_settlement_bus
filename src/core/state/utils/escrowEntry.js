import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import stateGenerated from '../../../codecs/state/state.generated.cjs';
import {safeDecodeEscrowEntry, safeEncodeEscrowEntry} from '../../../codecs/state/escrowEntryCodec.js';

import {
    BALANCE_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    HTLC_LOCK_ID_BYTE_LENGTH,
    HTLC_PREIMAGE_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
} from '../../../utils/constants.js';
import {isBufferValid, isZeroBuffer, NULL_BUFFER} from '../../../utils/buffer.js';
import {toBalance} from './balance.js';
import {bufferToAddress} from './address.js';

const {EscrowStatus} = stateGenerated.state;

export const ESCROW_ENTRY_VERSION = 3;

export const Status = Object.freeze({
    PENDING: EscrowStatus.PENDING,
    CLAIMED: EscrowStatus.CLAIMED,
    REFUNDED: EscrowStatus.REFUNDED,
});

function isRequiredBuffer(value, size) {
    return isBufferValid(value, size) && !isZeroBuffer(value);
}

function isSettlementAddress(value, hrp) {
    const address = bufferToAddress(value, hrp);
    const publicKey = address && tracCryptoApi.address.decodeSafe(address);
    return isRequiredBuffer(publicKey, PUBLIC_KEY_LENGTH);
}

function hasValidSettlementFields({
    lockId,
    lockerAddress,
    claimRecipientAddress,
    refundRecipientAddress,
    amount,
    additionalFeeAmount,
    additionalFeeRecipientAddress,
    hashLock,
    refundEpoch,
    policyHash,
}, hrp) {
    const feeIsZero = isBufferValid(additionalFeeAmount, BALANCE_BYTE_LENGTH) && isZeroBuffer(additionalFeeAmount);
    const requiredFieldsAreValid =
        isRequiredBuffer(lockId, HTLC_LOCK_ID_BYTE_LENGTH) &&
        isSettlementAddress(lockerAddress, hrp) &&
        isSettlementAddress(claimRecipientAddress, hrp) &&
        isSettlementAddress(refundRecipientAddress, hrp) &&
        isRequiredBuffer(amount, BALANCE_BYTE_LENGTH) &&
        isBufferValid(additionalFeeAmount, BALANCE_BYTE_LENGTH) &&
        isRequiredBuffer(hashLock, HASH_BYTE_LENGTH) &&
        isRequiredBuffer(refundEpoch, EPOCH_BYTE_LENGTH);
    const feeFieldsAreValid = feeIsZero
        ? additionalFeeRecipientAddress === undefined
        : isSettlementAddress(additionalFeeRecipientAddress, hrp);
    const policyHashIsValid = policyHash === undefined || isRequiredBuffer(policyHash, HASH_BYTE_LENGTH);

    return requiredFieldsAreValid && feeFieldsAreValid && policyHashIsValid &&
        Boolean(toBalance(amount).add(toBalance(additionalFeeAmount)));
}

/**
 * Encodes settlement state using canonical addresses for the configured prefix.
 * Nonce, signer set, threshold, and signatures remain in the lock transaction.
 */
export function init({
    lockId,
    lockerAddress,
    claimRecipientAddress,
    refundRecipientAddress,
    amount,
    additionalFeeAmount,
    additionalFeeRecipientAddress,
    hashLock,
    refundEpoch,
    policyHash,
} = {}, hrp) {
    const entry = {
        version: ESCROW_ENTRY_VERSION,
        status: Status.PENDING,
        lockId,
        lockerAddress,
        claimRecipientAddress,
        refundRecipientAddress,
        amount,
        additionalFeeAmount,
        additionalFeeRecipientAddress,
        hashLock,
        refundEpoch,
        policyHash,
    };
    if (!hasValidSettlementFields(entry, hrp)) return NULL_BUFFER;
    return safeEncodeEscrowEntry(entry);
}

export function decode(entry, hrp) {
    try {
        const decoded = safeDecodeEscrowEntry(entry);
        if (
            !decoded ||
            decoded.version !== ESCROW_ENTRY_VERSION ||
            !Object.values(Status).includes(decoded.status) ||
            !hasValidSettlementFields(decoded, hrp) ||
            (decoded.preimage !== undefined && !isRequiredBuffer(decoded.preimage, HTLC_PREIMAGE_BYTE_LENGTH)) ||
            ((decoded.status === Status.CLAIMED) !== (decoded.preimage !== undefined))
        ) {
            return null;
        }

        decoded.additionalFeeRecipientAddress ??= null;
        decoded.preimage ??= null;
        decoded.policyHash ??= null;
        return decoded;
    } catch {
        return null;
    }
}

// Pure escrow helpers only; claim/refund operations and apply handlers are not wired here.
export function makeClaim(entry, preimage, currentEpoch, hrp) {
    const escrow = decode(entry, hrp);
    if (
        !escrow ||
        escrow.status !== Status.PENDING ||
        !isRequiredBuffer(preimage, HTLC_PREIMAGE_BYTE_LENGTH) ||
        !isBufferValid(currentEpoch, EPOCH_BYTE_LENGTH) ||
        b4a.compare(currentEpoch, escrow.refundEpoch) >= 0 ||
        !b4a.equals(tracCryptoApi.hash.sha256(preimage), escrow.hashLock)
    ) {
        return null;
    }

    const claimedEntry = safeEncodeEscrowEntry({...escrow, status: Status.CLAIMED, preimage});
    if (claimedEntry.length === 0) return null;

    return {
        address: escrow.claimRecipientAddress,
        amount: toBalance(escrow.amount),
        additionalFeeRecipientAddress: escrow.additionalFeeRecipientAddress,
        additionalFeeAmount: toBalance(escrow.additionalFeeAmount),
        entry: claimedEntry,
    };
}

export function makeRefund(entry, currentEpoch, hrp) {
    const escrow = decode(entry, hrp);
    if (
        !escrow ||
        escrow.status !== Status.PENDING ||
        !isBufferValid(currentEpoch, EPOCH_BYTE_LENGTH) ||
        b4a.compare(currentEpoch, escrow.refundEpoch) < 0
    ) {
        return null;
    }

    const refundAmount = toBalance(escrow.amount)?.add(toBalance(escrow.additionalFeeAmount));
    if (!refundAmount) return null;
    const refundedEntry = safeEncodeEscrowEntry({...escrow, status: Status.REFUNDED});
    if (refundedEntry.length === 0) return null;

    return {
        address: escrow.refundRecipientAddress,
        amount: refundAmount,
        entry: refundedEntry,
    };
}
