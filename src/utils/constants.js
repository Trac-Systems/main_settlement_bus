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

export const EventType = Object.freeze({
    ADMIN_EVENT: 'adminEvent',
    WRITER_EVENT: 'writerEvent',
    IS_INDEXER: 'is-indexer',
    IS_NON_INDEXER: 'is-non-indexer',
    READY_MSB: 'ready-msb',
    WRITABLE: 'writable',
    UNWRITABLE: 'unwritable',
    WARNING: 'warning',
});

export const WHITELIST_FILEPATH = './Whitelist/pubkeys.csv';
export const LISTENER_TIMEOUT = 10000;
export const TRAC_NAMESPACE = 'TracNetwork';
export const WHITELIST_PREFIX = 'whitelist/';
export const MAX_INDEXERS = 10_000;
export const MIN_INDEXERS = 1;
export const WHITELIST_SLEEP_INTERVAL = 1000;
export const MAX_PEERS = 64;
export const MAX_PARALLEL = 64;
export const MAX_SERVER_CONNECTIONS = Infinity;
export const MAX_CLIENT_CONNECTIONS = Infinity;
export const UPDATER_INTERVAL = 1_000;

const constants = {
    EntryType,
    OperationType,
    EventType,
    WHITELIST_FILEPATH,
    LISTENER_TIMEOUT,
    TRAC_NAMESPACE,
    MAX_INDEXERS,
    MIN_INDEXERS,
    WHITELIST_SLEEP_INTERVAL,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    UPDATER_INTERVAL,
    WHITELIST_PREFIX
};

export default constants;

