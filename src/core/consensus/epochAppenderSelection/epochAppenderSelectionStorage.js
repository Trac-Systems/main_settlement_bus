import b4a from 'b4a';
import { EpochAppenderSelectionError, EpochAppenderSelectionErrorCode } from './EpochAppenderSelectionError.js';

// Retain the v1 key/envelope; the contained state is upgraded to v2 durable voting on open.
export const EPOCH_APPENDER_SELECTION_STATE_KEY = 'msb/epoch-append/v1';

/**
 * Loads the selection state from local Hypercore userData. This record is not part of the replicated
 * application state.
 *
 * @param {object} localMetadataStore Autobase instance with getUserData.
 * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppenderSelectionState|null>} Decoded record. The selector checks its contents.
 */
export async function loadSelectionState(localMetadataStore) {
    const encodedSelectionState = await localMetadataStore.getUserData(EPOCH_APPENDER_SELECTION_STATE_KEY);
    if (!encodedSelectionState) {
        return null;
    }
    return decodeSelectionState(encodedSelectionState);
}

/**
 * Saves the selection state locally before confirming a vote or authorizing an append.
 *
 * @param {object} localMetadataStore Autobase instance with setUserData.
 * @param {import('./epochAppenderSelectionState.js').EpochAppenderSelectionState} selectionState Copy of the selection state to save.
 * @returns {Promise<void>}
 */
export function saveSelectionState(localMetadataStore, selectionState) {
    const encodedSelectionState = encodeSelectionState(selectionState);
    return localMetadataStore.setUserData(EPOCH_APPENDER_SELECTION_STATE_KEY, encodedSelectionState);
}

/**
 * Decodes the saved record. The journal field keeps its old name for compatibility and contains the
 * local selection state.
 *
 * @param {Buffer} encodedSelectionState Encoded record read from userData.
 * @returns {import('./epochAppenderSelectionState.js').EpochAppenderSelectionState} Decoded state that still needs validation.
 * @throws {EpochAppenderSelectionError} If the JSON or record format is invalid.
 */
export function decodeSelectionState(encodedSelectionState) {
    let storageEnvelope;
    try {
        storageEnvelope = JSON.parse(b4a.toString(encodedSelectionState));
    } catch (cause) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Cannot decode epoch appender selection state', { cause });
    }
    // The v1 storage envelope retains its original field name for compatibility.
    if (!storageEnvelope || !storageEnvelope.journal || typeof storageEnvelope.journal !== 'object') {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID, 'Epoch appender selection state record is missing');
    }
    return storageEnvelope.journal;
}

/**
 * Encodes the selection state using the existing storage format.
 *
 * @param {import('./epochAppenderSelectionState.js').EpochAppenderSelectionState} selectionState Local record.
 * @returns {Buffer}
 */
export function encodeSelectionState(selectionState) {
    // Retain the legacy envelope field for byte compatibility; it no longer controls activation.
    return b4a.from(JSON.stringify({ activationEpoch: '1', journal: selectionState }));
}
