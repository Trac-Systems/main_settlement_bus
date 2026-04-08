import test from 'brittle'

import { ENV } from '../../../src/config/env.js'
import { isRpcEnabled, resolveConfigFromArgs, resolveEnvironment } from '../../../src/config/args.js'

function assertCliError(t, fn, expectedMessage) {
    try {
        fn()
        t.fail(`Expected CLI validation error: ${expectedMessage}`)
    } catch (error) {
        t.is(error.message, expectedMessage)
    }
}

test('args: resolves environment defaults and aliases', t => {
    t.is(resolveEnvironment([]), ENV.MAINNET)
    t.is(resolveEnvironment(['--network', ENV.MAINNET]), ENV.MAINNET)
    t.is(resolveEnvironment(['--network', ENV.DEVELOPMENT]), ENV.DEVELOPMENT)
    t.is(resolveEnvironment(['--network', ENV.TESTNET1]), ENV.TESTNET1)
    t.is(resolveEnvironment(['--network', 'testnet']), ENV.TESTNET1)
})

test('args: rejects invalid network values', t => {
    assertCliError(
        t,
        () => resolveEnvironment(['--network']),
        'MainSettlementBus CLI: --network requires a value.'
    )

    assertCliError(
        t,
        () => resolveEnvironment(['--network', 'staging']),
        'MainSettlementBus CLI: --network must be one of: mainnet, development, testnet1, testnet.'
    )
})

test('args: detects rpc mode and applies rpc config overrides', t => {
    t.ok(isRpcEnabled(['--rpc']))
    t.absent(isRpcEnabled([]))

    const config = resolveConfigFromArgs([
        '--rpc',
        '--network', ENV.DEVELOPMENT,
        '--host', '127.0.0.1',
        '--port', '5001',
        '--stores-directory', 'tmp/msb'
    ])

    t.is(config.host, '127.0.0.1')
    t.is(config.port, 5001)
    t.is(config.storesDirectory, 'tmp/msb')
    t.absent(config.wallet)
})

test('args: rejects invalid port values', t => {
    for (const value of [undefined, 'abc', '123abc', '0', '65536']) {
        const args = value === undefined ? ['--rpc', '--port'] : ['--rpc', '--port', value]
        const expected = value === undefined
            ? 'MainSettlementBus CLI: --port requires a value.'
            : 'MainSettlementBus CLI: --port must be an integer between 1 and 65535.'

        assertCliError(t, () => resolveConfigFromArgs(args), expected)
    }
})

test('args: rejects missing or empty string options', t => {
    assertCliError(
        t,
        () => resolveConfigFromArgs(['--rpc', '--host']),
        'MainSettlementBus CLI: --host requires a value.'
    )

    assertCliError(
        t,
        () => resolveConfigFromArgs(['--stores-directory']),
        'MainSettlementBus CLI: --stores-directory requires a value.'
    )
})
