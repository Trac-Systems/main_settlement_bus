import { test } from 'brittle';
import b4a from 'b4a';
import { v7 as uuidv7 } from 'uuid';

import PendingRequestService from '../../../src/core/network/services/PendingRequestService.js';
import NetworkWalletFactory from '../../../src/core/network/identity/NetworkWalletFactory.js';
import NetworkMessageBuilder from '../../../src/messages/network/v1/NetworkMessageBuilder.js';
import { V1UnexpectedError } from '../../../src/core/network/protocols/v1/V1ProtocolError.js';
import { NetworkOperationType } from '../../../src/utils/constants.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1 } from '../../fixtures/apply.fixtures.js';

function installFakeTimeouts(t) {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    const callbacks = new Map();
    let nextId = 1;
    let restored = false;

    globalThis.setTimeout = (fn, _ms, ...args) => {
        const id = nextId++;
        callbacks.set(id, () => fn(...args));
        return {
            _clear: () => {
                callbacks.delete(id);
            }
        };
    };

    globalThis.clearTimeout = timer => {
        if (timer && typeof timer._clear === 'function') {
            timer._clear();
            return;
        }
        if (callbacks.delete(timer)) return;
        if (timer && typeof timer === 'object' && typeof originalClearTimeout === 'function') {
            originalClearTimeout(timer);
        }
    };

    const restore = () => {
        if (restored) return;
        restored = true;
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        callbacks.clear();
    };

    t.teardown(restore);

    return {
        runAll() {
            for (const [id, cb] of callbacks) {
                callbacks.delete(id);
                cb();
            }
        },
        restore
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
        t.ok(error instanceof V1UnexpectedError);
        t.is(error.message, expectedError.message);
        t.is(error.endConnection, false);
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

    try {
        timers.runAll();

        try {
            await promise;
            t.fail('Expected pending request to time out');
        } catch (error) {
            t.ok(error?.message?.includes(`timed out after ${pendingRequestTimeout} ms`));
        }

        t.is(service.has(request.id), false);
    } finally {
        timers.restore();
    }
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

test('PendingRequestService rejects all pending requests for a specific peer', async t => {
    const service = new PendingRequestService(config);
    const peerA = 'deadbeef';
    const peerB = 'cafebabe';
    const requestA1 = await buildV1Request();
    const requestA2 = await buildV1Request();
    const requestB1 = await buildV1Request();

    const promiseA1 = service.registerPendingRequest(peerA, requestA1);
    const promiseA2 = service.registerPendingRequest(peerA, requestA2);
    const promiseB1 = service.registerPendingRequest(peerB, requestB1);

    const rejectedCount = service.rejectPendingRequestsForPeer(peerA, new Error('peer disconnected'));
    t.is(rejectedCount, 2);
    t.is(service.has(requestA1.id), false);
    t.is(service.has(requestA2.id), false);
    t.is(service.has(requestB1.id), true);

    const results = await Promise.allSettled([promiseA1, promiseA2]);
    t.is(results[0].status, 'rejected');
    t.is(results[0].reason.message, 'peer disconnected');
    t.is(results[1].status, 'rejected');
    t.is(results[1].reason.message, 'peer disconnected');

    t.ok(service.resolvePendingRequest(requestB1.id));
    await promiseB1;
});
