import sinon from 'sinon';
import { test } from 'brittle';
import b4a from 'b4a';
import NetworkWalletFactory from '../../../src/core/network/identity/NetworkWalletFactory.js';
import ValidatorHealthCheckService from '../../../src/core/network/services/ValidatorHealthCheckService.js';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { createConfig, ENV } from '../../../src/config/env.js';
import { EventType } from '../../../src/utils/constants.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';

function createWallet() {
    const keyPair = {
        publicKey: b4a.from(testKeyPair1.publicKey, 'hex'),
        secretKey: b4a.from(testKeyPair1.secretKey, 'hex')
    };
    return NetworkWalletFactory.provide({
        enableWallet: false,
        keyPair,
        networkPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX
    });
}

test('ValidatorHealthCheckService', () => {
    test('throws when start is called before ready', async (t) => {
        const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
        const wallet = createWallet();
        const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);

        await t.exception(() => service.start(testKeyPair1.publicKey));
        await service.close();
    });

    test('constructor rejects invalid capabilities', async (t) => {
        const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
        const wallet = createWallet();

        await t.exception.all(() => new ValidatorHealthCheckService(wallet, 'not-an-array', config));
        await t.exception.all(() => new ValidatorHealthCheckService(wallet, [123], config));
    });

    test('constructor rejects invalid interval', async (t) => {
        const wallet = createWallet();
        const badConfig = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 0 });

        await t.exception.all(() => new ValidatorHealthCheckService(wallet, ['cap:v1'], badConfig));
    });

    test('stop returns false when no schedule exists', async (t) => {
        const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
        const wallet = createWallet();
        const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);
        await service.ready();

        t.is(service.stop(testKeyPair1.publicKey), false);
        await service.close();
    });

    test('has throws on invalid public key type', async (t) => {
        const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
        const wallet = createWallet();
        const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);
        await service.ready();

        await t.exception.all(() => service.has(123));
        await service.close();
    });

    test('start returns false when already scheduled', async (t) => {
        const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
        const wallet = createWallet();
        const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);
        await service.ready();

        t.ok(service.start(testKeyPair1.publicKey));
        t.is(service.start(testKeyPair1.publicKey), false);
        await service.close();
    });

    test('emits health check on interval', async (t) => {
        const clock = sinon.useFakeTimers({ now: 0 });
        try {
            const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
            const wallet = createWallet();
            const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);
            await service.ready();

            const emitted = new Promise(resolve => {
                service.once(EventType.VALIDATOR_HEALTH_CHECK, resolve);
            });
            t.ok(service.start(testKeyPair1.publicKey));

            await clock.tickAsync(1000);
            const payload = await emitted;
            t.is(payload.publicKey, testKeyPair1.publicKey.toLowerCase());
            t.ok(payload.requestId);
            t.ok(payload.message);
            await service.close();
        } finally {
            clock.restore();
            sinon.restore();
        }
    });

    test('stopAll cancels scheduled checks', async (t) => {
        const clock = sinon.useFakeTimers({ now: 0 });
        try {
            const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
            const wallet = createWallet();
            const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);
            await service.ready();
            const emitted = [];
            const waitForTwo = new Promise(resolve => {
                service.on(EventType.VALIDATOR_HEALTH_CHECK, payload => {
                    emitted.push(payload);
                    if (emitted.length === 2) resolve();
                });
            });
            t.ok(service.start(testKeyPair1.publicKey));
            t.ok(service.start(testKeyPair2.publicKey));

            await clock.tickAsync(1000);
            await waitForTwo;
            t.is(emitted.length, 2);

            await service.close();

            await clock.tickAsync(1000);
            t.is(emitted.length, 2);
        } finally {
            clock.restore();
            sinon.restore();
        }
    });
});
