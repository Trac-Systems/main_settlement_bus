import tracCryptoApi from 'trac-crypto-api';
import { toHex } from '../../../utils/buffer.js';
import { EpochAppenderSelector } from './EpochAppenderSelector.js';
import { EpochAppenderSelectionOperations } from './EpochAppenderSelectionOperations.js';

/**
 * Wire one selector to local storage, ledger readers and the consensus protocol.
 * @param {object} state
 * @param {object} wallet
 * @param {object} config
 * @param {function(): object} getManager Resolves the manager after network initialization.
 * @param {object} [logger]
 * @param {object} [pendingRequests]
 * @returns {EpochAppenderSelector}
 */
export function createEpochAppenderSelector(state, wallet, config, getManager, logger, pendingRequests) {
    const publicKey = toHex(tracCryptoApi.address.decode(wallet.address));
    const retryMs = Math.max(100, Math.min(config.epochBackoffDelay, 1000));
    const operations = new EpochAppenderSelectionOperations(state, wallet, config, getManager, logger, pendingRequests);
    return new EpochAppenderSelector(publicKey, operations, retryMs, config.epochSignatureTimeout, true, retryMs);
}
