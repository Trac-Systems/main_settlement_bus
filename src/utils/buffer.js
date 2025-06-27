import b4a from 'b4a';

const isUInt32 = (n) => { return Number.isInteger(n) && n >= 1 && n <= 0xFFFFFFFF; }

export const safeWriteUInt32BE = (value, offset) => {
    try {
        const buf = b4a.alloc(4);
        buf.writeUInt32BE(value, offset);
        return buf;
    } catch (error) {
        return b4a.alloc(4);
    }
}

export const createMessage = (...args) => {
    
    if (args.length === 0) return b4a.alloc(0);

    const buffers = args.map(arg => {
        if (b4a.isBuffer(arg)) {
            return arg;
        } else if (typeof arg === 'number' && isUInt32(arg)) {
            const buf = safeWriteUInt32BE(arg, 0);
            return buf;
        }
    }).filter(buf => b4a.isBuffer(buf));

    if (buffers.length === 0) return b4a.alloc(0);
    return b4a.concat(buffers);
}
