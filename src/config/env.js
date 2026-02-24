import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { Config } from './config.js';
import { TRAC_NETWORK_TESTNET_ID, TRAC_NETWORK_MAINNET_ID } from 'trac-crypto-api/constants.js';

const TRAC_NETWORK_MSB_TESTNET1_PREFIX = "testtrac"

export const ENV = {
    MAINNET: 'mainnet',
    DEVELOPMENT: 'development',
    TESTNET1: 'testnet1'
}
// TODO: CREATE TEST ENV CONFIG SIMILAR TO MAINNET AND USE IT IN TESTS.

const configData = {
    [ENV.TESTNET1]: {
        addressLength: 67,
        addressPrefix: TRAC_NETWORK_MSB_TESTNET1_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_TESTNET1_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_TESTNET1_PREFIX.length + 1, // len(addressPrefix + separator)
        bootstrap: 'a7c0c2cf8e4722129097f89b2a29a092f23d6268fcca3fd9570ba5b702b99b95',
        channel: '1111trac1network1msb1testnet1111',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'], // these are used to peer discovery
        disableRateLimit: false,
        enableErrorApplyLogs: true,
        enableInteractiveMode: true,
        enableRoleRequester: false,
        enableTxApplyLogs: true,
        enableValidatorObserver: true,
        enableWallet: true,
        maxValidators: 6,
        maxRetries: 1,
        messageThreshold: 1000,
        messageValidatorRetryDelay: 1000, //How long to wait before retrying (ms) MESSAGE_VALIDATOR_RETRY_DELAY_MS
        messageValidatorResponseTimeout: 3 * 3 * 1000, //Overall timeout for sending a message (ms). This is 3 * maxRetries * messageValidatorRetryDelay;
        host: '0.0.0.0',
        port: 5000,
        networkId: TRAC_NETWORK_TESTNET_ID,
        maxPeers: 64, // Connectivity constants
        maxParallel: 64, // Connectivity constants
        maxServerConnections: Infinity, // Connectivity constants
        maxClientConnections: Infinity, // Connectivity constants
        maxWritersForAdminIndexerConnection: 10, // Connectivity constants
        processIntervalMs: 50, // Pool constants
        maxPartialTxPayloadByteSize: 3072, // Operation handler constants
        transactionPoolSize: 1000, // Operation handler constants
        rateLimitCleanupIntervalMs: 120_000, // Rate limiting constants
        rateLimitConnectionTimeoutMs: 60_000, // Rate limiting constants
        rateLimitMaxTransactionsPerSecond: 50, // Rate limiting constants
        storesDirectory : 'testnet/',
    },
    [ENV.MAINNET]: {
        addressLength: 63,
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        bootstrap: 'acbc3a4344d3a804101d40e53db1dda82b767646425af73599d4cd6577d69685',
        channel: '0000trac0network0msb0mainnet0000',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        disableRateLimit: false,
        enableErrorApplyLogs: false,
        enableInteractiveMode: true,
        enableRoleRequester: false,
        enableTxApplyLogs: false,
        enableValidatorObserver: true,
        enableWallet: true,
        maxValidators: 50,
        maxRetries: 3,
        messageThreshold: 3,
        messageValidatorRetryDelay: 1000, //How long to wait before retrying (ms) MESSAGE_VALIDATOR_RETRY_DELAY_MS
        messageValidatorResponseTimeout: 3 * 3 * 1000, //Overall timeout for sending a message (ms). This is 3 * maxRetries * messageValidatorRetryDelay;
        host: '0.0.0.0',
        port: 5000,
        networkId: TRAC_NETWORK_MAINNET_ID,
        maxPeers: 64, // Connectivity constants
        maxParallel: 64, // Connectivity constants
        maxServerConnections: Infinity, // Connectivity constants
        maxClientConnections: Infinity, // Connectivity constants
        maxWritersForAdminIndexerConnection: 10, // Connectivity constants
        processIntervalMs: 50, // Pool constants
        maxPartialTxPayloadByteSize: 3072, // Operation handler constants
        transactionPoolSize: 1000, // Operation handler constants
        rateLimitCleanupIntervalMs: 120_000, // Rate limiting constants
        rateLimitConnectionTimeoutMs: 60_000, // Rate limiting constants
        rateLimitMaxTransactionsPerSecond: 50, // Rate limiting constants
        storesDirectory: 'stores/',
    },
    [ENV.DEVELOPMENT]: {
        addressLength: 63,
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        bootstrap: 'e90cca53847a12a82f3bf0f67401e45e2ccc1698ee163e61414c2894eb3c6b12',
        channel: '12312313123123',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        disableRateLimit: false,
        enableErrorApplyLogs: true,
        enableInteractiveMode: true,
        enableRoleRequester: false,
        enableTxApplyLogs: true,
        enableValidatorObserver: true,
        enableWallet: true,
        maxValidators: 6,
        maxRetries: 0,
        messageThreshold: 1000,
        messageValidatorRetryDelay: 1000, //How long to wait before retrying (ms) MESSAGE_VALIDATOR_RETRY_DELAY_MS
        messageValidatorResponseTimeout: 3 * 3 * 1000, //Overall timeout for sending a message (ms). This is 3 * maxRetries * messageValidatorRetryDelay;
        host: 'localhost',
        port: 5000,
        networkId: TRAC_NETWORK_TESTNET_ID,
        maxPeers: 64, // Connectivity constants
        maxParallel: 64, // Connectivity constants
        maxServerConnections: Infinity, // Connectivity constants
        maxClientConnections: Infinity, // Connectivity constants
        maxWritersForAdminIndexerConnection: 10, // Connectivity constants
        processIntervalMs: 50, // Pool constants
        maxPartialTxPayloadByteSize: 3072, // Operation handler constants
        transactionPoolSize: 1000, // Operation handler constants
        rateLimitCleanupIntervalMs: 120_000, // Rate limiting constants
        rateLimitConnectionTimeoutMs: 60_000, // Rate limiting constants
        rateLimitMaxTransactionsPerSecond: 50, // Rate limiting constants
        storesDirectory : 'stores/',
    }
}

export const createConfig = (environment, options) => {
    return new Config(options, configData[environment])
}
