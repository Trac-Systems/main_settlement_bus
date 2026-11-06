import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import {createMessage, isZeroBuffer, uint8ToBuffer, uint32ToBuffer} from './buffer.js';
import {
    AMOUNT_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    HTLC_MAX_SIGNERS,
    HTLC_METADATA_MAX_BYTE_LENGTH,
    HTLC_THRESHOLD_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    OperationType,
    PUBLIC_KEY_LENGTH,
    UINT32_MAX,
} from './constants.js';

const EMPTY_METADATA = b4a.alloc(0);

function requireBuffer(value, length, field, allowZero = false) {
    if (!b4a.isBuffer(value) || value.length !== length || (!allowZero && isZeroBuffer(value))) {
        throw new Error(`${field} must be a${allowZero ? '' : ' non-zero'} ${length}-byte buffer.`);
    }
}

/**
 * Creates the canonical message committed by every HTLC lock authorizer.
 * Signatures and validator completion fields are intentionally excluded.
 */
export function createHtlcLockSigningMessage(networkId, locker, operation) {
    if (!Number.isInteger(networkId) || networkId < 1 || networkId > UINT32_MAX) {
        throw new Error('HTLC network id must be an unsigned non-zero 32-bit integer.');
    }
    if (!operation || !Array.isArray(operation.ss)) {
        throw new Error('HTLC lock operation and signer set are required.');
    }
    if (!b4a.isBuffer(locker) || locker.length === 0) {
        throw new Error('HTLC locker must be a non-empty address buffer.');
    }
    if (operation.ss.length < 1 || operation.ss.length > HTLC_MAX_SIGNERS) {
        throw new Error(`HTLC signer set must contain between 1 and ${HTLC_MAX_SIGNERS} public keys.`);
    }

    requireBuffer(operation.txv, HASH_BYTE_LENGTH, 'HTLC transaction validity');
    requireBuffer(operation.ca, locker.length, 'HTLC claim address');
    requireBuffer(operation.ra, locker.length, 'HTLC refund address');
    requireBuffer(operation.am, AMOUNT_BYTE_LENGTH, 'HTLC amount');
    requireBuffer(operation.fa, AMOUNT_BYTE_LENGTH, 'HTLC fee amount', true);
    requireBuffer(operation.hl, HASH_BYTE_LENGTH, 'HTLC hashlock');
    requireBuffer(operation.re, EPOCH_BYTE_LENGTH, 'HTLC refund epoch');
    requireBuffer(operation.th, HTLC_THRESHOLD_BYTE_LENGTH, 'HTLC threshold');
    requireBuffer(operation.in, NONCE_BYTE_LENGTH, 'HTLC nonce');
    if (operation.fr !== undefined) requireBuffer(operation.fr, locker.length, 'HTLC fee recipient');
    if (operation.md !== undefined && (
        !b4a.isBuffer(operation.md) || operation.md.length === 0 || operation.md.length > HTLC_METADATA_MAX_BYTE_LENGTH
    )) {
        throw new Error(`HTLC metadata must be a buffer containing 1 to ${HTLC_METADATA_MAX_BYTE_LENGTH} bytes.`);
    }

    const feeIsZero = isZeroBuffer(operation.fa);
    if (feeIsZero === (operation.fr !== undefined)) {
        throw new Error('HTLC fee recipient must be present exactly when the fee amount is non-zero.');
    }

    const signerKeys = new Set();
    for (let index = 0; index < operation.ss.length; index++) {
        const signer = operation.ss[index];
        requireBuffer(signer, PUBLIC_KEY_LENGTH, `HTLC signer ${index}`);
        const signerHex = b4a.toString(signer, 'hex');
        if (signerKeys.has(signerHex)) throw new Error('HTLC signer set must not contain duplicates.');
        signerKeys.add(signerHex);
        if (index > 1 && b4a.compare(operation.ss[index - 1], signer) >= 0) {
            throw new Error('HTLC cosigner public keys must be sorted by raw bytes.');
        }
    }

    const threshold = operation.th[0];
    if (threshold < 1 || threshold > operation.ss.length) {
        throw new Error('HTLC threshold must be between one and the signer-set size.');
    }

    return createMessage(
        networkId,
        locker,
        operation.txv,
        operation.ca,
        operation.ra,
        operation.am,
        operation.fa,
        operation.fr ?? b4a.alloc(locker.length),
        operation.hl,
        operation.re,
        uint32ToBuffer(operation.md?.length ?? 0),
        operation.md ?? EMPTY_METADATA,
        uint8ToBuffer(operation.ss.length),
        ...operation.ss,
        operation.th,
        operation.in,
        OperationType.HTLC_LOCK
    );
}

/**
 * Match signatures to cosigner keys using Bitcoin-style forward-only scanning.
 * Both arrays must be in signer-set order; omitted cosigners need no placeholder.
 */
export function verifyOrderedHtlcCosignerSignatures(signatures, transactionHash, signerSet) {
    if (!Array.isArray(signatures) || !Array.isArray(signerSet)) return false;

    let signerIndex = 1;
    for (const signature of signatures) {
        let matched = false;
        while (signerIndex < signerSet.length) {
            matched = tracCryptoApi.signature.verify(signature, transactionHash, signerSet[signerIndex]);
            signerIndex++;
            if (matched) break;
        }
        if (!matched) return false;
    }

    return true;
}
