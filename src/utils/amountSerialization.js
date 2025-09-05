import b4a from "b4a";

// FUNCTUIONS TO SERIALIZE AND DESERIALIZE AMOUNTS ONLY ON CLI LEVEL. ATTENTION DO NOT USE IT ON PROTOCOL LEVEL
export function decimalStringToBigInt(inputString, decimals = 18) {
    if (typeof inputString !== 'string') {
        throw new TypeError('Input must be a string');
    }

    const trimmedInput = inputString.trim();

    // Check for negative numbers first
    if (trimmedInput.startsWith('-')) {
        throw new Error('Negative amounts are not allowed');
    }

    if (!/^\d+(\.\d+)?$/.test(trimmedInput)) {
        throw new Error('Invalid decimal format. Use format: 123.456');
    }

    const parts = trimmedInput.split('.');
    const integerPart = parts[0];
    let fractionalPart = parts[1] || '';
    if (fractionalPart.length > decimals) {
        throw new Error(`Too many decimal places. Maximum allowed: ${decimals}`);
    }

    // Check if the amount is zero after trimming leading/trailing zeros
    const isZero = integerPart.replace(/^0+/, '') === '' && (!fractionalPart || fractionalPart.replace(/0+$/, '') === '');
    if (isZero) {
        throw new Error('Amount cannot be zero');
    }

    fractionalPart = fractionalPart.padEnd(decimals, '0');
    const fullNumberString = integerPart + fractionalPart;

    try {
        const value = BigInt(fullNumberString);
        // Check if the value exceeds maximum allowed (2^128 - 1)
        if (value > (2n ** 128n - 1n)) {
            throw new Error('Amount exceeds maximum allowed value (2^128 - 1)');
        }
        return value;
    } catch (error) {
        if (error.message.includes('exceeds maximum')) {
            throw error;
        }
        throw new Error(`Failed to convert to BigInt: ${error.message}`);
    }
}

export function bigIntTo16ByteBuffer(bigIntValue) {
    if (typeof bigIntValue !== 'bigint') {
        throw new TypeError('Input must be a BigInt');
    }

    const value = BigInt.asUintN(128, bigIntValue);
    const buff = b4a.alloc(16);

    let tmp = value;
    for (let i = 15; i >= 0; i--) {
        buff[i] = Number(tmp & 0xffn);
        tmp = tmp >> 8n;
    }
    return buff;
}

export function bufferToBigInt(buff) {
    if (!b4a.isBuffer(buff) || buff.length !== 16) {
        throw new TypeError('Input must be a 16-byte Buffer');
    }

    let res = 0n;
    for (let i = 0; i < 16; i++) {
        res = (res << 8n) | BigInt(buff[i]);
    }

    return res;
}