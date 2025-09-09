import b4a from 'b4a';
import { setBalance } from './nodeEntry.js';
import { isBufferValid, bigIntToBuffer } from '../../../utils/buffer.js';
import { BALANCE_BYTE_LENGTH, TOKEN_DECIMALS } from '../../../utils/constants.js';
import { bufferToBigInt } from '../../../utils/amountSerialization.js';

class BalanceError extends Error {}

const EMPTY_BUFFER = b4a.alloc(0)

export const $TNK = bigint => bigIntToBuffer(bigint * 10n ** TOKEN_DECIMALS, BALANCE_BYTE_LENGTH)

const addBuffers = (a, b) => {
    if (a.length !== b.length) return EMPTY_BUFFER
    const result = b4a.alloc(a.length);
    let carry = 0;
    for (let i = a.length - 1; i >= 0; i--) {
        const sum = a[i] + b[i] + carry;
        result[i] = sum & 0xff;
        carry = sum >> 8;
    }
    return result;
}

const subBuffers = (a, b) => {
    if (a.length !== b.length) return EMPTY_BUFFER
    const result = b4a.alloc(a.length);
    let borrow = 0;
    for (let i = a.length - 1; i >= 0; i--) {
        let diff = a[i] - b[i] - borrow;
        if (diff < 0) {
            diff += 256;
            borrow = 1;
        } else {
            borrow = 0;
        }
        result[i] = diff;
    }
    return result;
}

const validateValue = value => {
    if (!isBufferValid(value, BALANCE_BYTE_LENGTH)) {
        throw new BalanceError(value)
    }
}

export class Balance {
    #value

    get value() {
        return this.#value
    }
    constructor(value) {
        validateValue(value)
        this.#value = value;
    }

    add(b) {
        return new Balance(addBuffers(this.#value, b.value))
    }

    sub(b) {
        return new Balance(subBuffers(this.#value, b.value))
    }

    update(nodeEntry) {
        return setBalance(nodeEntry, this.#value)
    }

    equals(b) {
        return b4a.equals(this.#value, b.value)
    }

    greaterThen(b) {
        return b4a.compare(this.#value, b.value) === 1
    }

    lowerThen(b) {
        return b4a.compare(this.#value, b.value) === -1
    }

    asHex() {
        return b4a.toString(this.#value, 'hex');
    }

    asBigInt() {
        return bufferToBigInt(this.#value)
    }
}
