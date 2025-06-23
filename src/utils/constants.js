import applyOperations from './protobuf/applyOperations.cjs';
export const EntryType = Object.freeze({
    ADMIN: 'admin',
    WHITELIST: 'whitelist',
    INDEXERS: 'indexers',
});

export const OperationType = Object.freeze({
    ADD_ADMIN: 'addAdmin',
    APPEND_WHITELIST: 'appendWhitelist',
    ADD_WRITER: 'addWriter',
    REMOVE_WRITER: 'removeWriter',
    ADD_INDEXER: 'addIndexer',
    REMOVE_INDEXER: 'removeIndexer',
    BAN_VALIDATOR: 'banValidator',
    WHITELISTED: 'whitelisted',
    TX: 'tx',
    PRE_TX: 'pre-tx',
    POST_TX: 'post-tx',
});

// TODO: Confirm with team whether 'tx' field should be deprecated or retained.
// Finalize this object structure during applyFunction refactor alignment.

// export const OperationType = Object.freeze({
//     ADD_ADMIN: applyOperations.OperationType.ADD_ADMIN,
//     APPEND_WHITELIST: applyOperations.OperationType.APPEND_WHITELIST,
//     ADD_WRITER: applyOperations.OperationType.ADD_WRITER,
//     REMOVE_WRITER: applyOperations.OperationType.REMOVE_WRITER,
//     ADD_INDEXER: applyOperations.OperationType.ADD_INDEXER,
//     REMOVE_INDEXER: applyOperations.OperationType.REMOVE_INDEXER,
//     BAN_VALIDATOR: applyOperations.OperationType.BAN_WRITER,
//     WHITELISTED: 'whitelisted',
//     TX: 'tx',
//     PRE_TX: 'pre-tx',
//     POST_TX: applyOperations.OperationType.POST_TX,
// });

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
export const ADDRESS_CHAR_HEX_LENGTH = 64;
export const WRITER_KEY_CHAR_HEX_LENGTH = 64;
export const NONCE_CHAR_HEX_LENGTH = 64;
export const HASH_CHAR_HEX_LENGTH = 64;
export const SIGNATURE_CHAR_HEX_LENGTH = 128;
