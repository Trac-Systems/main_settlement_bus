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
    test('emits health check on interval', async (t) => {
        const clock = sinon.useFakeTimers({ now: 0 });
        try {
            const config = createConfig(ENV.MAINNET, { validatorHealthCheckInterval: 1000 });
            const wallet = createWallet();
            const service = new ValidatorHealthCheckService(wallet, ['cap:v1'], config);

            const emitted = new Promise(resolve => {
                service.once(EventType.VALIDATOR_HEALTH_CHECK, resolve);
            });
            t.ok(service.start(testKeyPair1.publicKey));

            clock.tick(1000);
            const payload = await emitted;
            t.is(payload.publicKey, testKeyPair1.publicKey.toLowerCase());
            t.ok(payload.requestId);
            t.ok(payload.message);
            service.stopAll();
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
            const emitted = [];
            const waitForTwo = new Promise(resolve => {
                service.on(EventType.VALIDATOR_HEALTH_CHECK, payload => {
                    emitted.push(payload);
                    if (emitted.length === 2) resolve();
                });
            });
            t.ok(service.start(testKeyPair1.publicKey));
            t.ok(service.start(testKeyPair2.publicKey));

            clock.tick(1000);
            await waitForTwo;
            t.is(emitted.length, 2);

            service.stopAll();

            clock.tick(1000);
            t.is(emitted.length, 2);
            service.stopAll();
        } finally {
            clock.restore();
            sinon.restore();
        }
    });
});
