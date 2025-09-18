import { OperationType } from './constants.js';
import {normalizeHex} from "./helpers.js";
import {addressToBuffer} from "../core/state/utils/address.js"

export function normalizeTransferOperation(payload) {
    if (!payload || typeof payload !== 'object' || !payload.tro) {
        throw new Error('Invalid payload for transfer operation normalization.');
    }
    const {type, address, tro} = payload;
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