import { OperationType as OP } from './protobuf/applyOperations.cjs';

export const EntryType = Object.freeze({
    ADMIN: 'admin',
    WHITELIST: 'whitelist',
    INDEXERS: 'indexers',
    WRITERS_LENGTH: 'wrl',
    WRITERS_INDEX: 'wri/',
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
    PRE_TX: 'PRE_TX',
    TX: OP.TX,
});

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
export const WHITELIST_SLEEP_INTERVAL = 1_000;

// Connectivity constants
export const MAX_PEERS = 64;
export const MAX_PARALLEL = 64;
export const MAX_SERVER_CONNECTIONS = Infinity;
export const MAX_CLIENT_CONNECTIONS = Infinity;
export const ACK_INTERVAL = 1_000;

// checkjs
export const WRITER_BYTE_LENGTH = 32;
export const NONCE_BYTE_LENGTH = 32;
export const HASH_BYTE_LENGTH = 32;
export const SIGNATURE_BYTE_LENGTH = 64;
export const MIN_SAFE_VALIDATION_INTEGER = 0x00000001;
export const MAX_SAFE_VALIDATION_INTEGER = 0xFFFFFFFF;
export const TX_HASH_HEXSTRING_LENGTH = 64;
export const WRITING_KEY_HEXSTRING_LENGTH = 64;
export const NONCE_HEXSTRING_LENGTH = 64;
export const CONTENT_HASH_HEXSTRING_LENGTH = 64;
export const SIGNATURE_HEXSTRING_LENGTH = 128;
export const BOOTSTRAP_HEXSTRING_LENGTH = 64;

// Pool constants
export const BATCH_SIZE = 10;
export const PROCESS_INTERVAL_MS = 5

// Rate limiting constants
export const CLEANUP_INTERVAL_MS = 120_000;
export const CONNECTION_TIMEOUT_MS = 60_000;
export const MAX_TRANSACTIONS_PER_SECOND = 50;

// PreTransaction constants // todo change name?
export const MAX_PRE_TX_PAYLOAD_BYTE_SIZE = 3072;
export const TRANSACTION_POOL_SIZE = 1000;

// Network message constants
export const NETWORK_MESSAGE_TYPES = Object.freeze({
    GET: {
        VALIDATOR: 'get_validator_pop',
        ADMIN: 'get_admin_pop',
        NODE: 'get_node_pop'
    },

    RESPONSE: {
        VALIDATOR: 'validatorResponse',
        ADMIN: 'adminResponse',
        NODE: 'nodeResponse'
    },

    OPERATION: {
        ADD_WRITER: 'addWriter',
        REMOVE_WRITER: 'removeWriter',
        ADD_ADMIN: 'addAdmin',
        WHITELISTED: 'whitelisted'
    }
});