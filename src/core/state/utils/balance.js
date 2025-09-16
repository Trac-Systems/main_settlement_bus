import b4a from 'b4a';
import { setBalance } from './nodeEntry.js';
import { isBufferValid, bigIntToBuffer, NULL_BUFFER } from '../../../utils/buffer.js';
import { BALANCE_BYTE_LENGTH, DEFAULT_PERCENTAGE, TOKEN_DECIMALS } from '../../../utils/constants.js';
import { bufferToBigInt } from '../../../utils/amountSerialization.js';

/**
 * Converts a bigint amount of tokens into a fixed-length buffer,
 * scaled according to TOKEN_DECIMALS.
 * Note: DO NOT USE IN APPLY FUNCTION.
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
    if (a.length !== b.length) return NULL_BUFFER
    const result = b4a.alloc(a.length);
    let carry = 0;
    for (let i = a.length - 1; i >= 0; i--) {
        const sum = a[i] + b[i] + carry;
        result[i] = sum & 0xff;
        carry = sum >> 8;
    }

    if(carry) return NULL_BUFFER // overflow
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
export const subBuffers = (a, b) => {
    if (a.length !== b.length) return NULL_BUFFER;

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

    // If we ended with borrow, it means a < b (underflow)
    if (borrow) return NULL_BUFFER;

    return result;
}

export const divideBuffers = (a, b) => {
    return NULL_BUFFER
}

export const multiplyBuffers = (a, b) => {
    return NULL_BUFFER
}

/**
 * Validates that a buffer has the correct length for balances.
 * Logs an error message if invalid.
 * @param {Buffer} value 
 */
const validateValue = value => {
    if (!isBufferValid(value, BALANCE_BYTE_LENGTH)) {
        throw new Error('Invalid balance') // Should be a qualified exception
    }
}

export function toBalance(balance) {
    try{
        return new Balance(balance)
    } catch(e) {
        console.error(e)
        return null
    }
}

/**
 * Balance class encapsulates a token balance stored as a fixed-length buffer.
 */
class Balance {
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
        validateValue(value)
        this.#value = value
    }

    /**
     * Adds another balance to this one.
     * @param {Balance} b 
     * @returns {Balance} - New Balance instance
     */
    add(b) {
        return toBalance(addBuffers(this.#value, b.value))
    }

    /**
     * Subtracts another balance from this one.
     * @param {Balance} b 
     * @returns {Balance} - New Balance instance
     */
    sub(b) {
        return toBalance(subBuffers(this.#value, b.value))
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

    /** Returns true if this balance is greater than or equal to another */
    greaterThanOrEquals(b) {
        const cmp = b4a.compare(this.#value, b.value)
        return cmp === 1 || cmp === 0
    }

    /** Returns true if this balance is lower than or equal to another */
    lowerThanOrEquals(b) {
        const cmp = b4a.compare(this.#value, b.value)
        return cmp === -1 || cmp === 0
    }

    // Note: DO NOT USE IN APPLY FUNCTION.
    /** Returns the hex string representation of the balance buffer */
    asHex() {
        return b4a.toString(this.#value, 'hex');
    }

    // Note: DO NOT USE IN APPLY FUNCTION.
    /** Returns the balance as a BigInt */
    asBigInt() {
        return bufferToBigInt(this.#value)
    }

    /**
     * Burns/subtracts a percentage of current balance from itself.
     * @param {BigInt} p - Percentage described with a BigInt
     * @returns {Balance} - New Balance instance with updated balance
     */
    burn(p) {
        const pAmt = divideBuffers(
            multiplyBuffers(this.#value, bigIntToBuffer(p, BALANCE_BYTE_LENGTH)), 
            bigIntToBuffer(DEFAULT_PERCENTAGE, BALANCE_BYTE_LENGTH))

        return toBalance(subBuffers(this.#value, pAmt))
    }
}
