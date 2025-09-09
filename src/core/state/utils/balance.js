import b4a from 'b4a';
import { setBalance } from './nodeEntry.js';
import { isBufferValid, bigIntToBuffer } from '../../../utils/buffer.js';
import { BALANCE_BYTE_LENGTH, TOKEN_DECIMALS } from '../../../utils/constants.js';
import { bufferToBigInt } from '../../../utils/amountSerialization.js';

/**
 * Empty buffer used as a fallback when operations fail.
 */
const EMPTY_BUFFER = b4a.alloc(0)

/**
 * Converts a bigint amount of tokens into a fixed-length buffer,
 * scaled according to TOKEN_DECIMALS.
 * @param {bigint} bigint - The amount of tokens
 * @returns {Buffer} - Fixed-length buffer representing token amount
 */
export const $TNK = bigint => bigIntToBuffer(
    bigint * 10n ** TOKEN_DECIMALS, 
    BALANCE_BYTE_LENGTH
)

/**
 * Adds two buffers of equal length as unsigned integers.
 * Returns a new buffer containing the result.
 * Overflow beyond the buffer length wraps around mod 2^(length*8).
 * @param {Buffer} a 
 * @param {Buffer} b 
 * @returns {Buffer} - Resulting buffer
 */
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

/**
 * Subtracts buffer b from buffer a as unsigned integers.
 * Returns a new buffer containing the result.
 * Underflow wraps around modulo 2^(length*8).
 * @param {Buffer} a 
 * @param {Buffer} b 
 * @returns {Buffer} - Resulting buffer
 */
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

/**
 * Validates that a buffer has the correct length for balances.
 * Logs an error message if invalid.
 * @param {Buffer} value 
 */
const validateValue = value => {
    try {
        return isBufferValid(value, BALANCE_BYTE_LENGTH)
    } catch (error) {
        console.log(error)
        return false
    }
}

/**
 * Balance class encapsulates a token balance stored as a fixed-length buffer.
 */
export class Balance {
    #value

    /** Returns the internal buffer */
    get value() {
        return this.#value
    }
    
    /**
     * Creates a Balance instance.
     * @param {Buffer} value - Buffer representing the balance
     */
    constructor(value) {
        this.#value = validateValue(value) ? value : null
    }

    /**
     * Adds another balance to this one.
     * @param {Balance} b 
     * @returns {Balance} - New Balance instance
     */
    add(b) {
        return new Balance(addBuffers(this.#value, b.value))
    }

    /**
     * Subtracts another balance from this one.
     * @param {Balance} b 
     * @returns {Balance} - New Balance instance
     */
    sub(b) {
        return new Balance(subBuffers(this.#value, b.value))
    }

    /**
     * Updates a node entry with this balance.
     * @param {Object} nodeEntry 
     */
    update(nodeEntry) {
        return setBalance(nodeEntry, this.#value)
    }

    /** Compares equality with another balance */
    equals(b) {
        return b4a.equals(this.#value, b.value)
    }

    /** Returns true if this balance is greater than another */
    greaterThan(b) {
        return b4a.compare(this.#value, b.value) === 1
    }

    /** Returns true if this balance is lower than another */
    lowerThan(b) {
        return b4a.compare(this.#value, b.value) === -1
    }

    /** Returns the hex string representation of the balance buffer */
    asHex() {
        return b4a.toString(this.#value, 'hex');
    }

    /** Returns the balance as a BigInt */
    asBigInt() {
        return bufferToBigInt(this.#value)
    }
}
