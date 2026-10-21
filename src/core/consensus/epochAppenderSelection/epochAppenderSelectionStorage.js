import b4a from 'b4a';
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';

// Retain the v1 key/envelope; the contained state is upgraded to v2 durable voting on open.
export const EPOCH_APPENDER_SELECTION_STATE_KEY = 'msb/epoch-append/v1';

/** Read local metadata; the storage adapter does not append to the ledger. */
export async function loadSelectionState(storage) {
    const value = await storage.getUserData(EPOCH_APPENDER_SELECTION_STATE_KEY);
    if (!value) {
        return null;
    }
    return decodeSelectionState(value);
}

/** Persist the selection state before acknowledging a change to another indexer. */
export function saveSelectionState(storage, selectionState) {
    const value = encodeSelectionState(selectionState);
    return storage.setUserData(EPOCH_APPENDER_SELECTION_STATE_KEY, value);
}

/** Recover durable votes from the existing user-data envelope. */
export function decodeSelectionState(value) {
    let record;
    try {
        record = JSON.parse(b4a.toString(value));
    } catch (cause) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Cannot decode epoch appender selection state', { cause });
    }
    // The v1 storage envelope retains its original field name for compatibility.
    if (!record || !record.journal || typeof record.journal !== 'object') {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Epoch appender selection state record is missing');
    }
    return record.journal;
}

/** Serialize only at the storage boundary; in-memory copies use the explicit schema. */
export function encodeSelectionState(selectionState) {
    // Retain the legacy envelope field for byte compatibility; it no longer controls activation.
    return b4a.from(JSON.stringify({ activationEpoch: '1', journal: selectionState }));
}
