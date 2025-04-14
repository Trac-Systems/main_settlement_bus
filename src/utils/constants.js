export const EntryType = Object.freeze({
    ADMIN: 'admin',
    WHITELIST: 'whitelist',
    INDEXERS: 'indexers',
});

export const OperationType = Object.freeze({
    ADD_ADMIN: 'addAdmin',
    APPEND_WHITELIST: 'AppendWhitelist',
    ADD_WRITER: 'addWriter',
    REMOVE_WRITER: 'removeWriter',
    ADD_INDEXER: 'addIndexer',
    REMOVE_INDEXER: 'removeIndexer',
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
export const MAX_INDEXERS = 3;
export const MIN_INDEXERS = 1;
export const ACK_INTERVAL = 1000;
export const WHITELIST_SLEEP_INTERVAL = 100;
export const MAX_PEERS = 8;
export const MAX_PARALLEL = 8;
export const MAX_SERVER_CONNECTIONS = 4;
export const MAX_CLIENT_CONNECTIONS = 4;
export const UPDATER_INTERVAL = 10_000;

const constants = {
    EntryType,
    OperationType,
    EventType,
    WHITELIST_FILEPATH,
    LISTENER_TIMEOUT,
    TRAC_NAMESPACE,
    MAX_INDEXERS,
    MIN_INDEXERS,
    ACK_INTERVAL,
    WHITELIST_SLEEP_INTERVAL,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    UPDATER_INTERVAL,
    WHITELIST_PREFIX
};

export default constants;

