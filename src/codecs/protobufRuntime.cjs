"use strict";

// protobufjs looks for `self` when running outside Node.js and browsers.
if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis;
}

const b4a = require('b4a');
const protobuf = require('protobufjs/minimal');

function isBytes(value) {
    return b4a.isBuffer(value) || Array.isArray(value) || protobuf.util.isString(value);
}

function bytesFrom(value) {
    if (b4a.isBuffer(value)) return b4a.toBuffer(value);
    if (Array.isArray(value)) return b4a.from(value);
    if (protobuf.util.isString(value)) return b4a.from(String(value), 'base64');
    throw TypeError('bytes must be a buffer, array or base64 string');
}

function bytesTo(value, options) {
    const bytes = bytesFrom(value);
    if (options.bytes === String) return b4a.toString(bytes, 'base64');
    if (options.bytes === Array) return Array.from(bytes);
    return bytes;
}

class Reader extends protobuf.Reader {
    constructor(buffer) {
        if (!b4a.isBuffer(buffer) && !Array.isArray(buffer)) {
            throw TypeError('illegal buffer');
        }
        super(bytesFrom(buffer));
    }

    static create(buffer) {
        // Keep a caller-supplied reader's position and length semantics.
        return buffer instanceof protobuf.Reader ? buffer : new Reader(buffer);
    }

    bytes() {
        const length = this.uint32();
        const start = this.pos;
        const end = start + length;
        if (end > this.len) {
            throw RangeError(`index out of range: ${start} + ${length} > ${this.len}`);
        }
        this.pos = end;
        return b4a.toBuffer(this.buf.subarray(start, end));
    }
}

const adaptedWriters = new WeakSet();

class Writer extends protobuf.Writer {
    static alloc(size) {
        return b4a.allocUnsafe(size);
    }

    static create(writer) {
        if (!writer) return new Writer();
        if (writer instanceof Writer || adaptedWriters.has(writer)) return writer;

        // Adapt only the supplied instance, never protobufjs's shared prototypes.
        const bytes = writer.bytes;
        const finish = writer.finish;
        writer.bytes = function (value) {
            return bytes.call(this, bytesFrom(value));
        };
        writer.finish = function () {
            return bytesFrom(finish.call(this));
        };
        adaptedWriters.add(writer);
        return writer;
    }

    bytes(value) {
        return super.bytes(bytesFrom(value));
    }
}

// Each generated module uses this facade; other protobufjs consumers are unchanged.
module.exports = {
    ...protobuf,
    Reader,
    Writer,
    util: {
        ...protobuf.util,
        newBuffer: value => typeof value === 'number' ? b4a.alloc(value) : bytesFrom(value),
        isBytes,
        bytesFrom,
        bytesTo
    }
};
