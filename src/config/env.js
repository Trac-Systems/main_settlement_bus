import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { TRAC_PUB_KEY_SIZE } from 'trac-crypto-api/constants.js'
import { isPear } from './args.js';

export const ENV = {
    MAINNET: 'mainnet',
    DEVELOPMENT: 'development',
    TEST: 'test'
}

const configData = {
    [ENV.MAINNET]: {
        bootstrap: '602d5443c19014e36a01254923afb1df56099d559f282761d70370a0da5d1d8a',
        channel: '0002tracnetworkmainsettlementbus',
        storesDirectory : 'stores/',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        addressLength: 63,
        networkId: 918
    },
    [ENV.DEVELOPMENT]: {
        bootstrap: '602d5443c19014e36a01254923afb1df56099d559f282761d70370a0da5d1d8a',
        channel: 'local12312',
        storesDirectory : 'dev_stores/',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        addressLength: 63,
        networkId: 920
    },
    [ENV.TEST]: {
        bootstrap: '602d5443c19014e36a01254923afb1df56099d559f282761d70370a0da5d1d8a',
        channel: 'test',
        storesDirectory : 'test_stores/',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        addressLength: 63,
        networkId: 919
    }
}

const environment = () => {
    if (global[Symbol.for('brittle-runner')]) return ENV.TEST
    if (!isPear() || !!Pear.config.flags.dev) return ENV.DEVELOPMENT
    return ENV.MAINNET
}

// This is using the old module pattern (+closure) because the proper which is through DI is going to demand a major refactor
let _config = configData[ENV.MAINNET]

export const config = () => _config

export const setConfig = () => {
    const env = environment()
    _config = configData[env]
}
