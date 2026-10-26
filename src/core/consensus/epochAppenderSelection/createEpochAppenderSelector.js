import tracCryptoApi from 'trac-crypto-api';
import { toHex } from '../../../utils/buffer.js';
import { EpochAppenderSelector } from './EpochAppenderSelector.js';
import { EpochAppenderSelectionOperations } from './EpochAppenderSelectionOperations.js';

/**
 * Creates the selector shared by protocol handlers and all local epoch rounds. Enables background
 * checks so pending appends are still observed after a round is cancelled.
 *
 * @param {import('../../state/State.js').default} state Local metadata and signed ledger reads.
 * @param {object} wallet Local signing wallet.
 * @param {object} config Election timeout and retry configuration.
 * @param {function(): object} getIndexerConnectionManager Returns the peer session manager after Network is ready.
 * @param {object} [logger] Background error logger.
 * @param {object} [pendingRequestService] Service used to cancel pending peer requests.
 * @returns {EpochAppenderSelector} Selector that Network will open and close.
 */
export function createEpochAppenderSelector(state, wallet, config, getIndexerConnectionManager, logger, pendingRequestService) {
    const localPublicKey = toHex(tracCryptoApi.address.decode(wallet.address));
    const retryIntervalMs = Math.max(100, Math.min(config.epochBackoffDelay, 1000));
    const selectionOperations = new EpochAppenderSelectionOperations(state, wallet, config, getIndexerConnectionManager, logger, pendingRequestService);
    return new EpochAppenderSelector(localPublicKey, selectionOperations, retryIntervalMs, config.epochSignatureTimeout, true, retryIntervalMs);
}
