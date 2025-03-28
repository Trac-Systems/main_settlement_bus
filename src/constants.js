export const EntryType = Object.freeze({
    ADMIN: 'admin',
    WHITELIST: 'whitelist',
});

export const OperationType = Object.freeze({
    ADD_ADMIN: 'addAdmin',
    APPEND_WHITELIST: 'AppendWhitelist',
    ADD_WRITER: 'addWriter',
    ADD_INDEXER: 'addIndexer',
    REMOVE_WRITER: 'removeWriter',
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