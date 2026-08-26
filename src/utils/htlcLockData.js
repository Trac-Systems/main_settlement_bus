import b4a from 'b4a';

import { addressToBuffer } from '../core/state/utils/address.js';
import { createMessage, NULL_BUFFER } from './buffer.js';
import { HASH_BYTE_LENGTH, EPOCH_BYTE_LENGTH } from './constants.js';
import { isHexString } from './helpers.js';

const normalizeHex = (value, fieldName, byteLength) => {
    if (b4a.isBuffer(value)) {
        if (value.length !== byteLength) {
            throw new Error(`${fieldName} must be ${byteLength} bytes.`);
        }
        return value;
    }

    if (typeof value !== 'string' || !isHexString(value) || value.length !== byteLength * 2) {
        throw new Error(`${fieldName} must be a ${byteLength * 2}-character hex string.`);
    }

    return b4a.from(value, 'hex');
};

/**
 * Serializes HTLC lock data in the field order defined by the protobuf:
 * hl, ra, ca, ee.
 *
 * @param {{hashLock: string|Buffer, refundAddress: string|Buffer, claimantAddress: string|Buffer, expirationEpoch: string|Buffer}} lockData
 * @param {string|Buffer} lockData.hashLock 32-byte hash, as hex or a buffer.
 * @param {string|Buffer} lockData.refundAddress TRAC refund address.
 * @param {string|Buffer} lockData.claimantAddress TRAC claimant address.
 * @param {string|Buffer} lockData.expirationEpoch 8-byte epoch, as hex or a buffer.
 * @param {string} addressPrefix Network address prefix.
 * @returns {Buffer} Concatenated binary lock data.
 */
export const encodeHtlcLockData = (
    { hashLock, refundAddress, claimantAddress, expirationEpoch } = {},
    addressPrefix
) => {
    if (typeof addressPrefix !== 'string' || addressPrefix.length === 0) {
        throw new Error('Address prefix is required.');
    }

    const refundAddressBuffer = addressToBuffer(refundAddress, addressPrefix);
    if (b4a.equals(refundAddressBuffer, NULL_BUFFER)) {
        throw new Error('Refund address must be a valid TRAC address.');
    }

    const claimantAddressBuffer = addressToBuffer(claimantAddress, addressPrefix);
    if (b4a.equals(claimantAddressBuffer, NULL_BUFFER)) {
        throw new Error('Claimant address must be a valid TRAC address.');
    }

    return createMessage(
        normalizeHex(hashLock, 'Hash lock', HASH_BYTE_LENGTH),
        refundAddressBuffer,
        claimantAddressBuffer,
        normalizeHex(expirationEpoch, 'Expiration epoch', EPOCH_BYTE_LENGTH)
    );
};
