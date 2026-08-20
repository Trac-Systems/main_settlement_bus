import b4a from 'b4a'
import { BALANCE_BYTE_LENGTH } from '../../../utils/constants.js';
import { isBufferValid } from '../../../utils/buffer.js';
import { NULL_BUFFER } from '../../../utils/buffer.js';
import { TRAC_PUB_KEY_SIZE } from 'trac-crypto-api/constants.js';

export const ESCROW_ENTRY_SIZE = BALANCE_BYTE_LENGTH + TRAC_PUB_KEY_SIZE + TRAC_PUB_KEY_SIZE;

export function init(maker, taker, balance) {
    if (!isBufferValid(balance, BALANCE_BYTE_LENGTH) ||
        !isBufferValid(maker, TRAC_PUB_KEY_SIZE) ||
        !isBufferValid(taker, TRAC_PUB_KEY_SIZE)) {
        return NULL_BUFFER;
    }

    try {
        const escrowEntry = b4a.alloc(ESCROW_ENTRY_SIZE);
        let offset = 0;

        b4a.copy(maker, escrowEntry, offset);
        offset += TRAC_PUB_KEY_SIZE;

        b4a.copy(taker, escrowEntry, offset);
        offset += TRAC_PUB_KEY_SIZE;

        b4a.copy(balance, escrowEntry, offset);
        offset += BALANCE_BYTE_LENGTH;

        return escrowEntry;
    } catch {
        return NULL_BUFFER;
    }
}