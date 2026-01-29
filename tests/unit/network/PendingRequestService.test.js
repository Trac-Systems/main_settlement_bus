import { test } from 'brittle';
import b4a from 'b4a';
import { v7 as uuidv7 } from 'uuid';

import PendingRequestService from '../../../src/core/network/services/PendingRequestService.js';
import NetworkWalletFactory from '../../../src/core/network/identity/NetworkWalletFactory.js';
import NetworkMessageBuilder from '../../../src/messages/network/v1/NetworkMessageBuilder.js';
import { NetworkOperationType } from '../../../src/utils/constants.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1 } from '../../fixtures/apply.fixtures.js';

function installFakeTimeouts(t) {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    const callbacks = new Map();
    let nextId = 1;

    globalThis.setTimeout = (fn, _ms, ...args) => {
        const id = nextId++;
        callbacks.set(id, () => fn(...args));
        return id;
    };

    globalThis.clearTimeout = id => {
        callbacks.delete(id);
    };

    t.teardown(() => {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        callbacks.clear();
    });

    return {
        runAll() {
            for (const [id, cb] of callbacks) {
                callbacks.delete(id);
                cb();
            }
        }
    };
}

function createWallet() {
    const keyPair = {
        publicKey: b4a.from(testKeyPair1.publicKey, 'hex'),
        secretKey: b4a.from(testKeyPair1.secretKey, 'hex')
    };
    return NetworkWalletFactory.provide({
        enableWallet: false,
        keyPair,
        networkPrefix: config.addressPrefix
    });
}

async function buildV1Request({ id = uuidv7() } = {}) {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet, config);
    await builder
        .setType(NetworkOperationType.LIVENESS_REQUEST)
        .setId(id)
        .setTimestamp()
        .setCapabilities([])
        .buildPayload();
    return builder.getResult();
}

test('PendingRequestService registers and resolves v1 request', async t => {
    const service = new PendingRequestService(config);
    const peer = 'deadbeef';
    const request = await buildV1Request();

    const promise = service.registerPendingRequest(peer, request);
    t.ok(service.has(request.id));

    t.ok(service.resolvePendingRequest(request.id));
    t.is(service.has(request.id), false);
    await promise;

    t.is(service.resolvePendingRequest(request.id), false);
});

test('PendingRequestService rejects and removes pending request', async t => {
    const service = new PendingRequestService(config);
    const peer = 'deadbeef';
    const request = await buildV1Request();

    const promise = service.registerPendingRequest(peer, request);
    const expectedError = new Error('test');

    t.ok(service.rejectPendingRequest(request.id, expectedError));
    t.is(service.has(request.id), false);

    try {
        await promise;
        t.fail('Expected pending request promise to reject');
    } catch (error) {
        t.is(error, expectedError);
    }

    t.is(service.rejectPendingRequest('missing', new Error('missing')), false);
});

test('PendingRequestService throws on duplicate request id', async t => {
    const service = new PendingRequestService(config);
    const peer = 'deadbeef';
    const request = await buildV1Request();

    const promise = service.registerPendingRequest(peer, request);

    t.exception(
        () => service.registerPendingRequest(peer, request),
        errorMessageIncludes('already exists')
    );

    t.ok(service.resolvePendingRequest(request.id));
    await promise;
});

test('PendingRequestService rejects pending request on timeout', async t => {
    const timers = installFakeTimeouts(t);
    const pendingRequestTimeout = 123;
    const service = new PendingRequestService({ pendingRequestTimeout });
    const peer = 'deadbeef';
    const request = await buildV1Request();

    const promise = service.registerPendingRequest(peer, request);
    t.ok(service.has(request.id));

    timers.runAll();

    try {
        await promise;
        t.fail('Expected pending request to time out');
    } catch (error) {
        t.ok(error?.message?.includes(`timed out after ${pendingRequestTimeout} ms`));
    }

    t.is(service.has(request.id), false);
});

test('PendingRequestService.close rejects all pending requests', async t => {
    const service = new PendingRequestService(config);
    const peer = 'deadbeef';
    const request1 = await buildV1Request();
    const request2 = await buildV1Request();

    const promise1 = service.registerPendingRequest(peer, request1);
    const promise2 = service.registerPendingRequest(peer, request2);

    service.close();
    t.is(service.has(request1.id), false);
    t.is(service.has(request2.id), false);

    const results = await Promise.allSettled([promise1, promise2]);
    t.is(results[0].status, 'rejected');
    t.ok(results[0]?.reason?.message?.includes(`Pending request ${request1.id} cancelled (shutdown).`));
    t.is(results[1].status, 'rejected');
    t.ok(results[1]?.reason?.message?.includes(`Pending request ${request2.id} cancelled (shutdown).`));
});
