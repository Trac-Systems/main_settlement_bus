import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { isPear } from './args.js';
import { Config } from './config.js';

export const ENV = {
    MAINNET: 'mainnet',
    DEVELOPMENT: 'development',
    TESTNET1: 'testnet1'
}

const configData = {
    [ENV.MAINNET]: {
        bootstrap: 'acbc3a4344d3a804101d40e53db1dda82b767646425af73599d4cd6577d69685',
        channel: '0000trac0network0msb0mainnet0000',
        storesDirectory : 'stores/',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        addressLength: 63,
        networkId: 918,
        channel: 'aChannel'
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
        networkId: 920,
        channel: 'aChannel'
    },
    [ENV.TESTNET1]: {
        bootstrap: '602d5443c19014e36a01254923afb1df56099d559f282761d70370a0da5d1d8a',
        channel: 'test',
        storesDirectory : 'test_stores/',
        dhtBootstrap: ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'],
        addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
        addressPrefixLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length,
        bech32mHrpLength: TRAC_NETWORK_MSB_MAINNET_PREFIX.length + 1, // len(addressPrefix + separator)
        addressLength: 63,
        networkId: 919,
        channel: 'aChannel'
    }
}

const environment = () => {
    if (global[Symbol.for('brittle-runner')]) return ENV.TESTNET1
    if (!isPear() || !!Pear.config.flags.dev) return ENV.DEVELOPMENT
    return ENV.MAINNET
}

export const createConfig = (override, options) => {
    const env = override || environment()
    return new Config(options, configData[env])
}
