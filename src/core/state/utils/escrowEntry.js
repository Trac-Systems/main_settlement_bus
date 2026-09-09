import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import {
    BALANCE_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    HTLC_LOCK_ID_BYTE_LENGTH,
    HTLC_PREIMAGE_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
} from '../../../utils/constants.js';
import {isBufferValid, isZeroBuffer, NULL_BUFFER} from '../../../utils/buffer.js';
import {toBalance} from './balance.js';

export const ESCROW_ENTRY_VERSION = 1;

export const Status = Object.freeze({
    PENDING: 0,
    CLAIMED: 1,
    REFUNDED: 2,
});

const FIELD_LAYOUT = Object.freeze([
    ['version', 1],
    ['status', 1],
    ['amount', BALANCE_BYTE_LENGTH],
    ['feeAmount', BALANCE_BYTE_LENGTH],
    ['locker', PUBLIC_KEY_LENGTH],
    ['claimRecipient', PUBLIC_KEY_LENGTH],
    ['refundRecipient', PUBLIC_KEY_LENGTH],
    ['feeRecipient', PUBLIC_KEY_LENGTH],
    ['lockId', HTLC_LOCK_ID_BYTE_LENGTH],
    ['nonce', NONCE_BYTE_LENGTH],
    ['hashLock', HASH_BYTE_LENGTH],
    ['preimage', HTLC_PREIMAGE_BYTE_LENGTH],
    ['counterpartyHash', HASH_BYTE_LENGTH],
    ['policyHash', HASH_BYTE_LENGTH],
    ['refundEpoch', EPOCH_BYTE_LENGTH],
]);

const fieldOffsets = {};
let encodedSize = 0;
for (const [name, size] of FIELD_LAYOUT) {
    fieldOffsets[name] = encodedSize;
    encodedSize += size;
}

export const ESCROW_ENTRY_SIZE = encodedSize;
const ZERO_PUBLIC_KEY = b4a.alloc(PUBLIC_KEY_LENGTH);
const ZERO_HASH = b4a.alloc(HASH_BYTE_LENGTH);

function copyField(entry, name) {
    const [, size] = FIELD_LAYOUT.find(([fieldName]) => fieldName === name);
    const offset = fieldOffsets[name];
    return b4a.from(entry.subarray(offset, offset + size));
}

function writeField(entry, name, value) {
    b4a.copy(value, entry, fieldOffsets[name]);
}

function isRequiredBuffer(value, size) {
    return isBufferValid(value, size) && !isZeroBuffer(value);
}

function isValidStatus(status) {
    return Object.values(Status).includes(status);
}

/**
 * Encodes the minimum state needed to settle an HTLC lock. The full signer set
 * and signatures remain available in the lock transaction identified by lockId.
 */
export function init({
    lockId,
    locker,
    claimRecipient,
    refundRecipient,
    amount,
    feeAmount,
    feeRecipient,
    nonce,
    hashLock,
    refundEpoch,
    counterpartyHash,
    policyHash,
} = {}) {
    const feeIsZero = isBufferValid(feeAmount, BALANCE_BYTE_LENGTH) && isZeroBuffer(feeAmount);
    const requiredFieldsAreValid =
        isRequiredBuffer(lockId, HTLC_LOCK_ID_BYTE_LENGTH) &&
        isRequiredBuffer(locker, PUBLIC_KEY_LENGTH) &&
        isRequiredBuffer(claimRecipient, PUBLIC_KEY_LENGTH) &&
        isRequiredBuffer(refundRecipient, PUBLIC_KEY_LENGTH) &&
        isRequiredBuffer(amount, BALANCE_BYTE_LENGTH) &&
        isBufferValid(feeAmount, BALANCE_BYTE_LENGTH) &&
        isRequiredBuffer(nonce, NONCE_BYTE_LENGTH) &&
        isRequiredBuffer(hashLock, HASH_BYTE_LENGTH) &&
        isRequiredBuffer(refundEpoch, EPOCH_BYTE_LENGTH) &&
        isRequiredBuffer(counterpartyHash, HASH_BYTE_LENGTH);
    const feeFieldsAreValid = feeIsZero
        ? feeRecipient === undefined
        : isRequiredBuffer(feeRecipient, PUBLIC_KEY_LENGTH);
    const policyHashIsValid = policyHash === undefined || isRequiredBuffer(policyHash, HASH_BYTE_LENGTH);

    if (!requiredFieldsAreValid || !feeFieldsAreValid || !policyHashIsValid) return NULL_BUFFER;

    const escrowTotal = toBalance(amount)?.add(toBalance(feeAmount));
    if (!escrowTotal) return NULL_BUFFER;

    try {
        const entry = b4a.alloc(ESCROW_ENTRY_SIZE);
        entry[fieldOffsets.version] = ESCROW_ENTRY_VERSION;
        entry[fieldOffsets.status] = Status.PENDING;
        writeField(entry, 'amount', amount);
        writeField(entry, 'feeAmount', feeAmount);
        writeField(entry, 'locker', locker);
        writeField(entry, 'claimRecipient', claimRecipient);
        writeField(entry, 'refundRecipient', refundRecipient);
        writeField(entry, 'feeRecipient', feeRecipient ?? ZERO_PUBLIC_KEY);
        writeField(entry, 'lockId', lockId);
        writeField(entry, 'nonce', nonce);
        writeField(entry, 'hashLock', hashLock);
        writeField(entry, 'preimage', ZERO_HASH);
        writeField(entry, 'counterpartyHash', counterpartyHash);
        writeField(entry, 'policyHash', policyHash ?? ZERO_HASH);
        writeField(entry, 'refundEpoch', refundEpoch);
        return entry;
    } catch {
        return NULL_BUFFER;
    }
}

export function decode(entry) {
    if (!isBufferValid(entry, ESCROW_ENTRY_SIZE)) return null;

    const version = entry[fieldOffsets.version];
    const status = entry[fieldOffsets.status];
    if (version !== ESCROW_ENTRY_VERSION || !isValidStatus(status)) return null;

    const feeRecipient = copyField(entry, 'feeRecipient');
    const preimage = copyField(entry, 'preimage');
    const policyHash = copyField(entry, 'policyHash');

    return {
        version,
        status,
        amount: copyField(entry, 'amount'),
        feeAmount: copyField(entry, 'feeAmount'),
        locker: copyField(entry, 'locker'),
        claimRecipient: copyField(entry, 'claimRecipient'),
        refundRecipient: copyField(entry, 'refundRecipient'),
        feeRecipient: isZeroBuffer(feeRecipient) ? null : feeRecipient,
        lockId: copyField(entry, 'lockId'),
        nonce: copyField(entry, 'nonce'),
        hashLock: copyField(entry, 'hashLock'),
        preimage: isZeroBuffer(preimage) ? null : preimage,
        counterpartyHash: copyField(entry, 'counterpartyHash'),
        policyHash: isZeroBuffer(policyHash) ? null : policyHash,
        refundEpoch: copyField(entry, 'refundEpoch'),
    };
}

export function makeClaim(entry, preimage, currentEpoch) {
    const escrow = decode(entry);
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

    const updatedEntry = b4a.from(entry);
    updatedEntry[fieldOffsets.status] = Status.CLAIMED;
    writeField(updatedEntry, 'preimage', preimage);

    return {
        publicKey: escrow.claimRecipient,
        amount: toBalance(escrow.amount),
        feePublicKey: escrow.feeRecipient,
        feeAmount: toBalance(escrow.feeAmount),
        entry: updatedEntry,
    };
}

export function makeRefund(entry, currentEpoch) {
    const escrow = decode(entry);
    if (
        !escrow ||
        escrow.status !== Status.PENDING ||
        !isBufferValid(currentEpoch, EPOCH_BYTE_LENGTH) ||
        b4a.compare(currentEpoch, escrow.refundEpoch) < 0
    ) {
        return null;
    }

    const refundAmount = toBalance(escrow.amount)?.add(toBalance(escrow.feeAmount));
    if (!refundAmount) return null;

    const updatedEntry = b4a.from(entry);
    updatedEntry[fieldOffsets.status] = Status.REFUNDED;

    return {
        publicKey: escrow.refundRecipient,
        amount: refundAmount,
        entry: updatedEntry,
    };
}
