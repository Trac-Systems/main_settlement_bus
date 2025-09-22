import { OperationType } from './constants.js';
import { normalizeHex } from './helpers.js';
import { addressToBuffer } from '../core/state/utils/address.js';
import b4a from 'b4a';

/**
 * Normalizes the payload for a transfer operation.
 * It validates the payload structure and converts specific fields
 * to the correct buffer or hexadecimal string format for processing.
 *
 * @param {Object} payload The raw payload for the transfer operation.
 * @returns {Object} A new object with addresses converted to buffers and hex values normalized.
 * @throws {Error} If the payload is invalid or missing required fields.
 */
export function normalizeTransferOperation(payload) {
    if (!payload || typeof payload !== 'object' || !payload.tro) {
        throw new Error('Invalid payload for transfer operation normalization.');
    }
    const { type, address, tro } = payload;
    if (
        type !== OperationType.TRANSFER ||
        !address ||
        !tro.tx || !tro.txv || !tro.in ||
        !tro.to || !tro.am || !tro.is
    ) {
        throw new Error('Missing required fields in transfer operation payload.');
    }

    const normalizedTro = {
        tx: normalizeHex(tro.tx),     // Transaction hash
        txv: normalizeHex(tro.txv),   // Transaction validity
        in: normalizeHex(tro.in),     // Nonce
        to: addressToBuffer(tro.to),   // Recipient address
        am: normalizeHex(tro.am),     // Amount
        is: normalizeHex(tro.is)      // Signature
    };

    return {
        type,
        address: addressToBuffer(address),
        tro: normalizedTro
    };
}

/**
 * Normalizes an operation payload by converting any Buffer values to hex strings.
 * This is useful for preparing a payload to be returned as a JSON response.
 *
 * @param {Object} payload The decoded transaction payload.
 * @returns {Object} A new object with Buffer values converted to hex strings.
 */
export function normalizeDecodedPayloadForJson(payload) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const newPayload = {};
    for (const key in payload) {
        if (payload.hasOwnProperty(key)) {
            const value = payload[key];
            if (b4a.isBuffer(value)) {
                newPayload[key] = b4a.toString(value, 'hex');
            } else if (typeof value === 'object' && value !== null) {
                // Recursively handle nested objects like `tro` or `rao`
                newPayload[key] = normalizeDecodedPayloadForJson(value);
            } else {
                newPayload[key] = value;
            }
        }
    }
    return newPayload;
}