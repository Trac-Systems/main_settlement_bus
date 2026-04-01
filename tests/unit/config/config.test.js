import test from 'brittle'
import b4a from 'b4a'

import { Config } from '../../../src/config/config.js'
import { createConfig, ENV } from '../../../src/config/env.js'
import { config as defaultConfig, overrideConfig } from '../../helpers/config.js'

function createBrokenBaseConfig(overrides = {}) {
    return new Proxy(defaultConfig, {
        get(target, property) {
            if (Object.prototype.hasOwnProperty.call(overrides, property)) {
                return overrides[property]
            }

            return Reflect.get(target, property, target)
        }
    })
}

function assertConfigError(t, fn, expectedMessage) {
    try {
        fn()
        t.fail(`Expected config validation error: ${expectedMessage}`)
    } catch (error) {
        t.is(error.message, expectedMessage)
    }
}

test('Config: existing env presets remain valid and bootstrap/channel are normalized', t => {
    for (const environment of [ENV.MAINNET, ENV.TESTNET1, ENV.DEVELOPMENT]) {
        const config = createConfig(environment, {})
        t.is(config.bootstrap.length, 32, `${environment} bootstrap length`)
        t.is(config.channel.length, 32, `${environment} channel length`)
    }
})

test('Config: rejects missing required bootstrap and channel', t => {
    assertConfigError(
        t,
        () => new Config({}, createBrokenBaseConfig({ bootstrap: undefined })),
        'MainSettlementBus Config: bootstrap is required.'
    )

    assertConfigError(
        t,
        () => new Config({}, createBrokenBaseConfig({ channel: undefined })),
        'MainSettlementBus Config: channel is required.'
    )
})

test('Config: rejects malformed bootstrap values', t => {
    assertConfigError(
        t,
        () => overrideConfig({ bootstrap: 'xyz-not-hex' }),
        'MainSettlementBus Config: bootstrap must be a 64-character hex string.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ bootstrap: b4a.alloc(31, 1) }),
        'MainSettlementBus Config: bootstrap must be a 32-byte Buffer or a 64-character hex string.'
    )
})

test('Config: rejects invalid channel values', t => {
    assertConfigError(
        t,
        () => overrideConfig({ channel: 123 }),
        'MainSettlementBus Config: channel must be a non-empty string or Buffer with at most 32 bytes.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ channel: 'x'.repeat(33) }),
        'MainSettlementBus Config: channel must be a non-empty string or Buffer with at most 32 bytes.'
    )
})

test('Config: rejects invalid network and storage settings', t => {
    assertConfigError(
        t,
        () => overrideConfig({ port: Number.NaN }),
        'MainSettlementBus Config: port must be an integer between 1 and 65535.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ port: 70000 }),
        'MainSettlementBus Config: port must be an integer between 1 and 65535.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ storesDirectory: '' }),
        'MainSettlementBus Config: storesDirectory must be a non-empty string.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ dhtBootstrap: ['node1.hyperdht.org'] }),
        'MainSettlementBus Config: dhtBootstrap must contain only valid "host:port" strings.'
    )
})

test('Config: rejects invalid numeric limits and timeouts', t => {
    assertConfigError(
        t,
        () => overrideConfig({ maxRetries: -1 }),
        'MainSettlementBus Config: maxRetries must be an integer greater than or equal to 0.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ maxPeers: 0 }),
        'MainSettlementBus Config: maxPeers must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ validatorHealthCheckInterval: -1 }),
        'MainSettlementBus Config: validatorHealthCheckInterval must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ pollInterval: 0 }),
        'MainSettlementBus Config: pollInterval must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ adminCacheTTL: 0 }),
        'MainSettlementBus Config: adminCacheTTL must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ bootstrapTimeout: 0 }),
        'MainSettlementBus Config: bootstrapTimeout must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ writersShortCacheTTL: 0 }),
        'MainSettlementBus Config: writersShortCacheTTL must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ writersLongCacheTTL: 0 }),
        'MainSettlementBus Config: writersLongCacheTTL must be an integer greater than or equal to 1.'
    )

    assertConfigError(
        t,
        () => overrideConfig({ validatorConnectionAttemptDelay: 0 }),
        'MainSettlementBus Config: validatorConnectionAttemptDelay must be an integer greater than or equal to 1.'
    )
})

test('Config: accepts valid bootstrap/channel overrides and keeps normalized buffers', t => {
    const bootstrap = b4a.alloc(32, 0xaa)
    const config = overrideConfig({ bootstrap, channel: 'abc' })

    t.ok(b4a.equals(config.bootstrap, bootstrap))
    t.is(config.channel.length, 32)
    t.is(b4a.toString(config.channel.subarray(0, 6), 'utf8'), 'abcabc')
})
