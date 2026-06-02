import b4a from 'b4a';
import networkV1Generated from './networkV1.generated.cjs';

const networkV1Operations = networkV1Generated.network.v1;

// Options for converting protobuf messages to plain objects, ensuring that bytes are returned as Buffers and enums as numbers.

const NETWORK_TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: true,
    arrays: true,
    oneofs: false
});

export const encodeV1networkOperation = (payload) => {
    return b4a.from(networkV1Operations.MessageHeader.encode(payload).finish());
}

export const decodeV1networkOperation = (payload) => {
    return networkV1Operations.MessageHeader.toObject(
        networkV1Operations.MessageHeader.decode(payload),
        NETWORK_TO_OBJECT_OPTIONS
    );
}
