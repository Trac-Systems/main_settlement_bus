import { OperationType as OP } from './protobuf/applyOperations.cjs';
// TODO: We are going to have a lot of contstants. It would be good, to separate them into different files.

//ATTENTION - THIS IS USED IN THE APPLY FUNCTION!
export const EntryType = Object.freeze({
    ADMIN: 'admin',
    INDEXERS: 'indexers',
    WRITERS_LENGTH: 'wrl',
    WRITERS_INDEX: 'wri/',
    DEPLOYMENT: 'deployment/',
});

//ATTENTION - THIS IS USED IN THE APPLY FUNCTION!
export const OperationType = Object.freeze({
    //TODO: ADD INIT_BALANCE,TOKEN_TRANSFER, BALANCE_INITIALIZED (to discuss),
    ADD_ADMIN: OP.ADD_ADMIN,
    APPEND_WHITELIST: OP.APPEND_WHITELIST,
    ADD_WRITER: OP.ADD_WRITER,
    REMOVE_WRITER: OP.REMOVE_WRITER,
    ADMIN_RECOVERY: OP.ADMIN_RECOVERY,
    ADD_INDEXER: OP.ADD_INDEXER,
    REMOVE_INDEXER: OP.REMOVE_INDEXER,
    BAN_VALIDATOR: OP.BAN_VALIDATOR,
    BOOTSTRAP_DEPLOYMENT: OP.BOOTSTRAP_DEPLOYMENT,
    TX: OP.TX,
});

// Role managment constants
export const EventType = Object.freeze({
    WRITER_EVENT: 'writer-event',
    IS_INDEXER: 'is-indexer',
    IS_NON_INDEXER: 'is-non-indexer',
    WRITABLE: 'writable',
    UNWRITABLE: 'unwritable',
    WARNING: 'warning',
});

export const WHITELIST_FILEPATH = './whitelist/addresses.csv';
export const TRAC_NAMESPACE = 'TracNetwork';
export const WHITELIST_SLEEP_INTERVAL = 1_000;

// Connectivity constants
export const MAX_PEERS = 64;
export const MAX_PARALLEL = 64;
export const MAX_SERVER_CONNECTIONS = Infinity;
export const MAX_CLIENT_CONNECTIONS = Infinity;
export const ACK_INTERVAL = 1_000;
export const DHT_BOOTSTRAPS = ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'];

// checkjs
//ATTENTION - THIS IS USED IN THE APPLY FUNCTION!
export const WRITER_BYTE_LENGTH = 32;
export const BOOTSTRAP_BYTE_LENGTH = 32;
export const NONCE_BYTE_LENGTH = 32;
export const HASH_BYTE_LENGTH = 32;
export const SIGNATURE_BYTE_LENGTH = 64;
export const MIN_SAFE_VALIDATION_INTEGER = 0x00000001;
export const MAX_SAFE_VALIDATION_INTEGER = 0xFFFFFFFF;

// index
export const BOOTSTRAP_HEXSTRING_LENGTH = 64;

// Pool constants
export const BATCH_SIZE = 10;
export const PROCESS_INTERVAL_MS = 5

// Rate limiting constants
export const CLEANUP_INTERVAL_MS = 120_000;
export const CONNECTION_TIMEOUT_MS = 60_000;
export const MAX_TRANSACTIONS_PER_SECOND = 50;

// Operation handler constants
export const MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE = 3072;
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
});
