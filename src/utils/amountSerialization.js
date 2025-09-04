import b4a from "b4a";

export function decimalStringToBigInt(inputString, decimals = 18) {
    if (typeof inputString !== 'string') {
        throw new TypeError('Input must be a string');
    }

    const trimmedInput = inputString.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmedInput)) {
        throw new Error('Invalid decimal format. Use format: 123.456');
    }

    const parts = trimmedInput.split('.');
    const integerPart = parts[0];
    let fractionalPart = parts[1] || '';
    if (fractionalPart.length > decimals) {
        throw new Error(`Too many decimal places. Maximum allowed: ${decimals}`);
    }

    fractionalPart = fractionalPart.padEnd(decimals, '0');
    const fullNumberString = integerPart + fractionalPart;

    try {
        return BigInt(fullNumberString);
    } catch (error) {
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