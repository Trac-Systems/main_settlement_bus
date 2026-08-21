import b4a from 'b4a'
import { BALANCE_BYTE_LENGTH, EPOCH_BYTE_LENGTH } from '../../../utils/constants.js';
import { isBufferValid } from '../../../utils/buffer.js';
import { NULL_BUFFER } from '../../../utils/buffer.js';
import { TRAC_PUB_KEY_SIZE, TRAC_HASH_SIZE } from 'trac-crypto-api/constants.js';
import { toBalance } from './balance.js';

export const ESCROW_ENTRY_SIZE = 1 + BALANCE_BYTE_LENGTH + TRAC_PUB_KEY_SIZE + TRAC_PUB_KEY_SIZE + TRAC_PUB_KEY_SIZE + TRAC_HASH_SIZE + TRAC_HASH_SIZE + TRAC_HASH_SIZE + EPOCH_BYTE_LENGTH;

const TAKER_OFFSET = BALANCE_BYTE_LENGTH + TRAC_PUB_KEY_SIZE;
const REFUND_OFFSET = TAKER_OFFSET + TRAC_PUB_KEY_SIZE;
const STATUS_OFFSET = ESCROW_ENTRY_SIZE - 1;
export const Status = Object.freeze({
    PENDING: 0,
    CLAIMED: 1,
    REFUNDED: 2,
});

export function init(id, maker, taker, lock, nonce, expiryEpoch, amount) {
    if (!isBufferValid(amount, BALANCE_BYTE_LENGTH) ||
        !isBufferValid(maker, TRAC_PUB_KEY_SIZE) ||
        !isBufferValid(taker, TRAC_PUB_KEY_SIZE) ||
        !isBufferValid(id, TRAC_HASH_SIZE) ||
        !isBufferValid(nonce, TRAC_HASH_SIZE) ||
        !isBufferValid(lock, TRAC_HASH_SIZE) ||
        !isBufferValid(expiryEpoch, EPOCH_BYTE_LENGTH)) {
        return NULL_BUFFER;
    }

    try {
        const escrowEntry = b4a.alloc(ESCROW_ENTRY_SIZE);
        let offset = 0;

        b4a.copy(amount, escrowEntry, offset);
        offset += BALANCE_BYTE_LENGTH;

        b4a.copy(maker, escrowEntry, offset);
        offset += TRAC_PUB_KEY_SIZE;

        b4a.copy(taker, escrowEntry, offset);
        offset += TRAC_PUB_KEY_SIZE;
        // maker is also the refund. The ledger structure can change independently.
        b4a.copy(maker, escrowEntry, offset);
        offset += TRAC_PUB_KEY_SIZE;

        b4a.copy(id, escrowEntry, offset);
        offset += TRAC_HASH_SIZE;

        b4a.copy(nonce, escrowEntry, offset);
        offset += TRAC_HASH_SIZE;

        b4a.copy(lock, escrowEntry, offset);
        offset += TRAC_HASH_SIZE;

        b4a.copy(expiryEpoch, escrowEntry, offset);
        offset += EPOCH_BYTE_LENGTH;

        escrowEntry[offset] = Status.PENDING;

        return escrowEntry;
    } catch {
        return NULL_BUFFER;
    }
}

function makeSettlement(escrowEntry, publicKeyOffset, status) {
    try {
        if (!isBufferValid(escrowEntry, ESCROW_ENTRY_SIZE)) {
            return NULL_BUFFER;
        }

        const amount = b4a.alloc(BALANCE_BYTE_LENGTH);
        const publicKey = b4a.alloc(TRAC_PUB_KEY_SIZE);

        b4a.copy(escrowEntry, amount, 0, 0, BALANCE_BYTE_LENGTH);
        b4a.copy(escrowEntry, publicKey, 0, publicKeyOffset, publicKeyOffset + TRAC_PUB_KEY_SIZE);

        b4a.fill(escrowEntry, 0, 0, BALANCE_BYTE_LENGTH);
        escrowEntry[STATUS_OFFSET] = status;

        return { publicKey, amount: toBalance(amount), entry: escrowEntry };
    } catch {
        return NULL_BUFFER;
    }
}

export function makeClaim(escrowEntry) {
    return makeSettlement(escrowEntry, TAKER_OFFSET, Status.CLAIMED);
}

export function makeRefund(escrowEntry) {
    return makeSettlement(escrowEntry, REFUND_OFFSET, Status.REFUNDED);
}
