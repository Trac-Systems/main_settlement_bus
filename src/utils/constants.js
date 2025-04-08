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
export const MAX_PUBKEYS_LENGTH = 20;
export const LISTENER_TIMEOUT = 5000;
export const TRAC_NAMESPACE = 'TracNetwork';
export const MAX_INDEXERS = 3;
export const MIN_INDEXERS = 1;
export const ACK_INTERVAL = 1000;
export const WHITELIST_SLEEP_INTERVAL = 10_000;
export const MAX_PEERS = 1024;
export const MAX_PARALLEL = 512;
export const MAX_SERVER_CONNECTIONS = 256;
export const UPDATER_INTERVAL = 10_000;

const constants = {
    EntryType,
    OperationType,
    EventType,
    WHITELIST_FILEPATH,
    MAX_PUBKEYS_LENGTH,
    LISTENER_TIMEOUT,
    TRAC_NAMESPACE,
    MAX_INDEXERS,
    MIN_INDEXERS,
    ACK_INTERVAL,
    WHITELIST_SLEEP_INTERVAL,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    UPDATER_INTERVAL
};

export default constants;

