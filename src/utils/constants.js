import {OperationType as OP} from './protobuf/applyOperations.cjs';
export const EntryType = Object.freeze({
    ADMIN: 'admin',
    WHITELIST: 'whitelist',
    INDEXERS: 'indexers',
});

export const OperationType = Object.freeze({
    ADD_ADMIN: OP.ADD_ADMIN,
    APPEND_WHITELIST: OP.APPEND_WHITELIST,
    ADD_WRITER: OP.ADD_WRITER,
    REMOVE_WRITER: OP.REMOVE_WRITER,
    ADD_INDEXER: OP.ADD_INDEXER,
    REMOVE_INDEXER: OP.REMOVE_INDEXER,
    BAN_VALIDATOR: OP.BAN_WRITER,
    WHITELISTED: OP.APPEND_WHITELIST,
    TX: 'tx',
    PRE_TX: 'pre-tx',
    POST_TX: OP.POST_TX,
});

// TODO: Confirm with team whether 'tx' field should be deprecated or retained.
// Finalize this object structure during applyFunction refactor alignment.
// and replace OperationType in this enum with applyOperations.OperationType. Just port it.

export const EventType = Object.freeze({
    ADMIN_EVENT: 'adminEvent',
    WRITER_EVENT: 'writerEvent',
    IS_INDEXER: 'is-indexer',
    IS_NON_INDEXER: 'is-non-indexer',
    WRITABLE: 'writable',
    UNWRITABLE: 'unwritable',
    WARNING: 'warning',
});

export const WHITELIST_FILEPATH = './Whitelist/pubkeys.csv';
export const LISTENER_TIMEOUT = 10_000;
export const TRAC_NAMESPACE = 'TracNetwork';
export const WHITELIST_PREFIX = 'whitelist/';
export const MAX_INDEXERS = 3;
export const MIN_INDEXERS = 1;
export const WHITELIST_SLEEP_INTERVAL = 1_000;
export const MAX_PEERS = 64;
export const MAX_PARALLEL = 64;
export const MAX_SERVER_CONNECTIONS = Infinity;
export const MAX_CLIENT_CONNECTIONS = Infinity;
export const ACK_INTERVAL = 1_000;

// checkjs
export const ADDRESS_BYTE_LENGTH = 32;
export const WRITER_BYTE_LENGTH = 32;
export const NONCE_BYTE_LENGTH = 32;
export const HASH_BYTE_LENGTH = 32;
export const SIGNATURE_BYTE_LENGTH = 64;
export const MIN_SAFE_INTEGER = 0x1;
export const MAX_SAFE_INTEGER = 0xFFFFFFFF;