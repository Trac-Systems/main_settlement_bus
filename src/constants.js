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
});

export const WHITELIST_FILEPATH = './whitelist/pubkeys.csv';
export const MAX_PUBKEYS_LENGTH = 100;
export const LISTENER_TIMEOUT = 5000; // 5 seconds
export const TracNamespace = 'TracNetwork';
export const MAX_INDEXERS = 5;