import process from 'process';

const integer = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

// Capture environment values once per Config, rather than reading changing globals per event.
export function createGraylogConfig(overrides = {}, env = process.env) {
    overrides = overrides && typeof overrides === 'object' ? overrides : {};
    const value = (name, variable, fallback = '') => overrides[name] ?? env[variable] ?? fallback;
    const url = String(value('url', 'GRAYLOG_URL')).trim();
    const environment = String(value('environment', 'NODE_ENV', 'unknown'));
    return Object.freeze({
        enabled: overrides.enabled !== false && !!url && (environment !== 'test' || overrides.allowInTests === true),
        url,
        token: String(value('token', 'GRAYLOG_TOKEN')),
        app: String(value('app', 'GRAYLOG_APP', 'msb-explorer-rpc')).trim() || 'msb-explorer-rpc',
        // GELF host identifies the emitting node; GRAYLOG_URL identifies the collector.
        host: String(value('host', 'GRAYLOG_HOST', env.HOSTNAME || env.COMPUTERNAME || 'msb-node')).trim() || 'msb-node',
        environment,
        release: String(value('release', 'GRAYLOG_RELEASE', 'unknown')),
        allowInTests: overrides.allowInTests === true,
        timeoutMs: integer(value('timeoutMs', 'GRAYLOG_TIMEOUT_MS'), 3000, 10, 60000),
        maxQueueSize: integer(value('maxQueueSize', 'GRAYLOG_MAX_QUEUE_SIZE'), 1000, 1, 10000),
        concurrency: integer(value('concurrency', 'GRAYLOG_CONCURRENCY'), 2, 1, 8),
        maxMessageBytes: integer(overrides.maxMessageBytes, 16384, 1024, 65536),
        intervalMs: integer(value('intervalMs', 'GRAYLOG_INTERVAL_MS'), 30000, 10, 3600000),
        stallTimeoutMs: integer(value('stallTimeoutMs', 'GRAYLOG_STALL_TIMEOUT_MS'), 60000, 10, 3600000),
        confirmationTimeoutMs: integer(value('confirmationTimeoutMs', 'GRAYLOG_CONFIRMATION_TIMEOUT_MS'), 60000, 10, 3600000),
    });
}
