import b4a from 'b4a';
import { setBalance } from './nodeEntry.js';
import { isBufferValid } from '../../../utils/buffer.js';
import { BALANCE_BYTE_LENGTH } from '../../../utils/constants.js';

class BalanceError extends Error {}

const addBuffers = (a, b) => {
    if (a.length !== b.length) throw new Error("Buffers must be same length");
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
    if (a.length !== b.length) throw new Error("Buffers must be same length");
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

    equal(b) {
        return b4a.equals(this.#value, b.value);
    }

    update(nodeEntry) {
        return setBalance(nodeEntry, this.#value)
    }

    asHex() {
        return b4a.toString(this.#value, 'hex');
    }

    asBigInt() {
        return BigInt(`0x${this.asHex()}`)
    }
}
