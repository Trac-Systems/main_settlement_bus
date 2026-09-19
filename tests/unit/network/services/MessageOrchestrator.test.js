import { hook, test } from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import MessageOrchestrator from '../../../../src/core/network/services/MessageOrchestrator.js';
import State from '../../../../src/core/state/State.js';
import { OperationType, ResultCode } from '../../../../src/utils/constants.js';
import { testKeyPair1, testKeyPair2 } from '../../../fixtures/apply.fixtures.js';
import { publicKeyToAddress } from '../../../../src/utils/helpers.js';
import ConnectionManager, { ConnectionManagerError } from '../../../../src/core/network/services/ConnectionManager.js';
import { PendingRequestServiceTimeoutError } from '../../../../src/core/network/services/PendingRequestService.js';
import { WalletProvider } from 'trac-wallet';
import { config, overrideConfig } from '../../../helpers/config.js';

async function createWallet(config) {
    return await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey)
}

const VALIDATOR_KEY = testKeyPair2.publicKey;

const createTransferMessage = (config, wallet) => ({
    type: OperationType.TRANSFER,
    address: wallet.address,
    tro: {
        tx: 'aa'.repeat(32),
        txv: 'bb'.repeat(32),
        in: 'cc'.repeat(32),
        to: publicKeyToAddress(testKeyPair2.publicKey, config),
        am: '00'.repeat(16),
        is: 'dd'.repeat(64),
    },
});

const createConnectionManager = ({
    preferredProtocol = 'v1',
    sendSingleMessage = sinon.stub().resolves(ResultCode.OK),
    sentCount = 0,
    connectedValidators = [VALIDATOR_KEY],
} = {}) => ({
    pickRandomConnectedValidator: sinon.stub().returns(VALIDATOR_KEY),
    pickRandomValidator: sinon.stub().callsFake((validators) => validators[0] ?? null),
    connectedValidators: sinon.stub().returns(connectedValidators),
    getConnection: sinon.stub().returns({
        protocolSession: {
            preferredProtocol,
            supportedProtocols: {
                LEGACY: 'legacy',
                V1: 'v1',
            }
        }
    }),
    sendSingleMessage,
    remove: sinon.stub(),
    incrementSentCount: sinon.stub(),
    getSentCount: sinon.stub().returns(sentCount),
});

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createReplacementHarness(config, preferredProtocol = 'v1') {
    const makeConnection = () => {
        const connection = new EventEmitter();
        connection.end = sinon.stub();
        connection.protocolSession = {
            preferredProtocol,
            supportedProtocols: { LEGACY: 'legacy', V1: 'v1' },
            send: sinon.stub().resolves(ResultCode.OK),
        };
        return connection;
    };
    const connectionManager = new ConnectionManager(config);
    const original = makeConnection();
    const replacement = makeConnection();
    connectionManager.addValidator(VALIDATOR_KEY, original);
    return {
        connectionManager,
        original,
        replacement,
        replace() {
            connectionManager.remove(VALIDATOR_KEY, { expectedConnection: original, endConnection: false });
            connectionManager.addValidator(VALIDATOR_KEY, replacement);
        },
    };
}

hook('setup', () => {
    sinon.stub(console, 'log');
    sinon.stub(console, 'warn');
});

hook('teardown', () => {
    sinon.restore();
});

test('MessageOrchestrator.send returns false for unsupported protocol', async t => {
    const connectionManager = createConnectionManager({ preferredProtocol: 'unknown' });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message, 0);

    t.is(result, false);
    t.is(connectionManager.sendSingleMessage.callCount, 0);
});

test('MessageOrchestrator.send V1 matrix: OK -> SUCCESS', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.OK),
        sentCount: 0,
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(connectionManager.incrementSentCount.callCount, 1);
    t.is(connectionManager.remove.callCount, 0);
});

test('MessageOrchestrator.send V1 matrix: TIMEOUT -> ROTATE', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.TIMEOUT),
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(connectionManager.sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 1);
    t.is(connectionManager.incrementSentCount.callCount, 0);
});

test('MessageOrchestrator.send V1 matrix: TX_ALREADY_PENDING -> NO_ROTATE', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.TX_ALREADY_PENDING),
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(connectionManager.sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 0);
    t.is(connectionManager.incrementSentCount.callCount, 0);
});

test('MessageOrchestrator.send treats TX_ALREADY_EXISTS as success when tx is already visible locally', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.TX_ALREADY_EXISTS),
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);
    sinon.stub(orchestrator, 'waitForUnsignedState').resolves(true);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(connectionManager.sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 0);
    t.is(connectionManager.incrementSentCount.callCount, 0);
});

test('MessageOrchestrator.send treats OPERATION_ALREADY_COMPLETED as success when tx is already visible locally', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.OPERATION_ALREADY_COMPLETED),
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);
    sinon.stub(orchestrator, 'waitForUnsignedState').resolves(true);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(connectionManager.sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 0);
    t.is(connectionManager.incrementSentCount.callCount, 0);
});

test('MessageOrchestrator.send V1 matrix: unknown code -> UNDEFINED', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(99999),
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(connectionManager.sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send removes validator when threshold reached on success', async t => {
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.OK),
        sentCount: config.messageThreshold,
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(connectionManager.incrementSentCount.callCount, 1);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send retries on ConnectionManagerError without removing validator', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new ConnectionManagerError('disconnected'));
    sendSingleMessage.onSecondCall().resolves(ResultCode.OK);

    const connectionManager = createConnectionManager({ sendSingleMessage, sentCount: 0 });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(connectionManager.remove.callCount, 0);
    t.is(connectionManager.incrementSentCount.callCount, 1);
});

test('MessageOrchestrator.send retries on generic catch error with remove + retry', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new Error('response validation failed'));
    sendSingleMessage.onSecondCall().resolves(ResultCode.OK);

    const connectionManager = createConnectionManager({ sendSingleMessage, sentCount: 0 });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(connectionManager.remove.callCount, 1);
    t.is(connectionManager.incrementSentCount.callCount, 1);
});

test('MessageOrchestrator.send max retries guard returns false immediately', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const connectionManager = createConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.OK),
    });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message, 2);

    t.is(result, false);
    t.is(connectionManager.pickRandomConnectedValidator.callCount, 0);
    t.is(connectionManager.sendSingleMessage.callCount, 0);
});

test('MessageOrchestrator.send timeout split: pending timeout rejection goes through catch and retries', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(
        new PendingRequestServiceTimeoutError('req-1', publicKeyToAddress(VALIDATOR_KEY, config), config.pendingRequestTimeout)
    );
    sendSingleMessage.onSecondCall().resolves(ResultCode.OK);

    const connectionManager = createConnectionManager({ sendSingleMessage });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send timeout split: TIMEOUT result code stays in then path and does not retry', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub().resolves(ResultCode.TIMEOUT);
    const connectionManager = createConnectionManager({ sendSingleMessage });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send validation split: thrown validation error goes through catch', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new Error('validator response validation failed'));
    sendSingleMessage.onSecondCall().resolves(ResultCode.OK);

    const connectionManager = createConnectionManager({ sendSingleMessage });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send validation split: non-OK result code stays in then and uses policy', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub().resolves(ResultCode.SCHEMA_VALIDATION_FAILED);
    const connectionManager = createConnectionManager({ sendSingleMessage });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(sendSingleMessage.callCount, 1);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send legacy path succeeds and increments sent count', async t => {
    const config = overrideConfig({ maxRetries: 0 });
    const sendSingleMessage = sinon.stub().resolves(true);
    const state = { waitForUnsigned: sinon.stub().resolves(true) };
    const connectionManager = createConnectionManager({
        preferredProtocol: 'legacy',
        sendSingleMessage,
        sentCount: 0,
    });
    const orchestrator = new MessageOrchestrator(connectionManager, state, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 1);
    t.is(state.waitForUnsigned.callCount, 1);
    t.is(connectionManager.incrementSentCount.callCount, 1);
    t.is(connectionManager.remove.callCount, 0);
});

test('MessageOrchestrator.send legacy path false result removes validator and retries', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const sendSingleMessage = sinon.stub().resolves(true);
    const state = { waitForUnsigned: sinon.stub() };
    state.waitForUnsigned.onFirstCall().resolves(false);
    state.waitForUnsigned.onSecondCall().resolves(true);
    const connectionManager = createConnectionManager({
        preferredProtocol: 'legacy',
        sendSingleMessage,
    });
    const orchestrator = new MessageOrchestrator(connectionManager, state, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(state.waitForUnsigned.callCount, 2);
    t.is(connectionManager.remove.callCount, 1);
});

test('MessageOrchestrator.send legacy path catches send error and retries', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new Error('legacy send failed'));
    sendSingleMessage.onSecondCall().resolves(true);
    const state = { waitForUnsigned: sinon.stub().resolves(true) };

    const connectionManager = createConnectionManager({
        preferredProtocol: 'legacy',
        sendSingleMessage,
    });
    const orchestrator = new MessageOrchestrator(connectionManager, state, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(state.waitForUnsigned.callCount, 1);
    t.is(connectionManager.remove.callCount, 0);
});

test('State.waitForUnsigned returns true when state entry appears', async t => {
    const clock = sinon.useFakeTimers({ now: 1 });
    try {
        const state = {
            get: sinon.stub()
                .onFirstCall().resolves(null)
                .onSecondCall().resolves({ tx: 'found' }),
        };

        const pending = State.prototype.waitForUnsigned.call(state, 'tx-hash', 500);
        await clock.tickAsync(450);
        const result = await pending;

        t.is(result, true);
        t.ok(state.get.callCount >= 2);
    } finally {
        clock.restore();
    }
});

test('State.waitForUnsigned returns false on timeout', async t => {
    const clock = sinon.useFakeTimers({ now: 1 });
    try {
        const state = { get: sinon.stub().resolves(null) };

        const pending = State.prototype.waitForUnsigned.call(state, 'tx-hash', 400);
        await clock.tickAsync(1000);
        const result = await pending;

        t.is(result, false);
        t.ok(state.get.callCount >= 1);
    } finally {
        clock.restore();
    }
});

test('MessageOrchestrator.send V1 avoids selecting validator with requester address when possible', async t => {
    const requesterValidatorKey = testKeyPair1.publicKey;
    const otherValidatorKey = testKeyPair2.publicKey;
    const sendSingleMessage = sinon.stub().resolves(ResultCode.OK);

    const connectionManager = createConnectionManager({
        sendSingleMessage,
        connectedValidators: [requesterValidatorKey, otherValidatorKey],
    });
    connectionManager.getConnection = sinon.stub().returns({
        protocolSession: {
            preferredProtocol: 'v1',
            supportedProtocols: {
                LEGACY: 'legacy',
                V1: 'v1',
            }
        }
    });

    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const requesterAddress = publicKeyToAddress(requesterValidatorKey, config);
    const wallet = await createWallet(config);
    const message = {
        ...createTransferMessage(config, wallet),
        address: requesterAddress,
    };

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 1);
    t.is(sendSingleMessage.firstCall.args[1], otherValidatorKey);
});

test('MessageOrchestrator stale V1 rejection preserves the replacement for the normal retry', async t => {
    const testConfig = overrideConfig({ maxRetries: 1 });
    const harness = createReplacementHarness(testConfig);
    const started = deferred();
    const response = deferred();
    harness.original.protocolSession.send.callsFake(() => {
        started.resolve();
        return response.promise;
    });
    const wallet = await createWallet(testConfig);
    const orchestrator = new MessageOrchestrator(harness.connectionManager, {}, testConfig);
    orchestrator.setWallet(wallet);
    const pending = orchestrator.send(createTransferMessage(testConfig, wallet));
    await started.promise;
    harness.replace();
    response.reject(new Error('old connection closed'));

    t.is(await pending, true, 'the existing retry succeeds through the replacement');
    t.is(harness.replacement.protocolSession.send.callCount, 1);
    t.is(harness.connectionManager.getConnection(VALIDATOR_KEY), harness.replacement);
    t.is(harness.connectionManager.getSentCount(VALIDATOR_KEY), 1, 'only the replacement request increments its counter');
    t.is(harness.replacement.end.callCount, 0);
});

test('MessageOrchestrator stale V1 success cannot increment or rotate a replacement near its threshold', async t => {
    const harness = createReplacementHarness(config);
    const started = deferred();
    const response = deferred();
    harness.original.protocolSession.send.callsFake(() => {
        started.resolve();
        return response.promise;
    });
    const wallet = await createWallet(config);
    const orchestrator = new MessageOrchestrator(harness.connectionManager, {}, config);
    orchestrator.setWallet(wallet);
    const pending = orchestrator.send(createTransferMessage(config, wallet));
    await started.promise;
    harness.replace();
    for (let sent = 0; sent < config.messageThreshold - 1; sent++) {
        harness.connectionManager.incrementSentCount(VALIDATOR_KEY);
    }
    response.resolve(ResultCode.OK);

    t.is(await pending, true, 'the original successful response remains successful');
    t.is(harness.connectionManager.getSentCount(VALIDATOR_KEY), config.messageThreshold - 1);
    t.is(harness.connectionManager.getConnection(VALIDATOR_KEY), harness.replacement);
    t.is(harness.replacement.end.callCount, 0);
    t.is(harness.replacement.protocolSession.send.callCount, 0);
});

for (const resultCode of [ResultCode.TIMEOUT, 99999]) {
    test(`MessageOrchestrator stale V1 policy result ${resultCode} cannot remove a replacement`, async t => {
        const harness = createReplacementHarness(config);
        const started = deferred();
        const response = deferred();
        harness.original.protocolSession.send.callsFake(() => {
            started.resolve();
            return response.promise;
        });
        const wallet = await createWallet(config);
        const orchestrator = new MessageOrchestrator(harness.connectionManager, {}, config);
        orchestrator.setWallet(wallet);
        const pending = orchestrator.send(createTransferMessage(config, wallet));
        await started.promise;
        harness.replace();
        response.resolve(resultCode);

        t.is(await pending, false, 'policy rejection still returns false without retrying');
        t.is(harness.connectionManager.getConnection(VALIDATOR_KEY), harness.replacement);
        t.is(harness.replacement.end.callCount, 0);
        t.is(harness.replacement.protocolSession.send.callCount, 0);
    });
}

test('MessageOrchestrator reselects the protocol when the connection changes during V1 request construction', async t => {
    const testConfig = overrideConfig({ maxRetries: 1 });
    const harness = createReplacementHarness(testConfig);
    harness.replacement.protocolSession.preferredProtocol = 'legacy';
    const state = { waitForUnsigned: sinon.stub().resolves(true) };
    const wallet = await createWallet(testConfig);
    const message = createTransferMessage(testConfig, wallet);
    const orchestrator = new MessageOrchestrator(harness.connectionManager, state, testConfig);
    orchestrator.setWallet(wallet);

    const pending = orchestrator.send(message);
    // V1 construction awaits hashing before dispatching the request.
    harness.replace();

    t.is(await pending, true);
    t.is(harness.original.protocolSession.send.callCount, 0);
    t.is(harness.replacement.protocolSession.send.callCount, 1);
    t.is(harness.replacement.protocolSession.send.firstCall.args[0], message, 'legacy replacement receives its canonical payload');
    t.is(harness.connectionManager.getSentCount(VALIDATOR_KEY), 1);
});

test('MessageOrchestrator late legacy confirmation does not increment or rotate a replacement', async t => {
    const harness = createReplacementHarness(config, 'legacy');
    const waiting = deferred();
    const confirmation = deferred();
    const state = {
        waitForUnsigned: sinon.stub().callsFake(() => {
            waiting.resolve();
            return confirmation.promise;
        }),
    };
    const wallet = await createWallet(config);
    const orchestrator = new MessageOrchestrator(harness.connectionManager, state, config);
    orchestrator.setWallet(wallet);
    const pending = orchestrator.send(createTransferMessage(config, wallet));
    await waiting.promise;
    harness.replace();
    for (let sent = 0; sent < config.messageThreshold - 1; sent++) {
        harness.connectionManager.incrementSentCount(VALIDATOR_KEY);
    }
    confirmation.resolve(true);

    t.is(await pending, true);
    t.is(harness.connectionManager.getSentCount(VALIDATOR_KEY), config.messageThreshold - 1);
    t.is(harness.connectionManager.getConnection(VALIDATOR_KEY), harness.replacement);
    t.is(harness.replacement.end.callCount, 0);
});

test('MessageOrchestrator expired legacy confirmation retries using the preserved replacement', async t => {
    const testConfig = overrideConfig({ maxRetries: 1 });
    const harness = createReplacementHarness(testConfig, 'legacy');
    const waiting = deferred();
    const confirmation = deferred();
    const state = { waitForUnsigned: sinon.stub().resolves(true) };
    state.waitForUnsigned.onFirstCall().callsFake(() => {
        waiting.resolve();
        return confirmation.promise;
    });
    const wallet = await createWallet(testConfig);
    const orchestrator = new MessageOrchestrator(harness.connectionManager, state, testConfig);
    orchestrator.setWallet(wallet);
    const pending = orchestrator.send(createTransferMessage(testConfig, wallet));
    await waiting.promise;
    harness.replace();
    confirmation.resolve(false);

    t.is(await pending, true);
    t.is(harness.replacement.protocolSession.send.callCount, 1);
    t.is(harness.connectionManager.getConnection(VALIDATOR_KEY), harness.replacement);
    t.is(harness.connectionManager.getSentCount(VALIDATOR_KEY), 1);
    t.is(harness.replacement.end.callCount, 0);
});

test('MessageOrchestrator exhausted legacy rejection cannot remove a replacement after recursive retry', async t => {
    const testConfig = overrideConfig({ maxRetries: 0 });
    const harness = createReplacementHarness(testConfig, 'legacy');
    const started = deferred();
    const response = deferred();
    harness.original.protocolSession.send.callsFake(() => {
        started.resolve();
        return response.promise;
    });
    const wallet = await createWallet(testConfig);
    const orchestrator = new MessageOrchestrator(harness.connectionManager, {}, testConfig);
    orchestrator.setWallet(wallet);
    const pending = orchestrator.send(createTransferMessage(testConfig, wallet));
    await started.promise;
    harness.replace();
    response.reject(new Error('old legacy request failed'));

    t.is(await pending, false, 'legacy retry exhaustion is unchanged');
    t.is(harness.connectionManager.getConnection(VALIDATOR_KEY), harness.replacement);
    t.is(harness.replacement.end.callCount, 0);
    t.is(harness.replacement.protocolSession.send.callCount, 0, 'maxRetries still prevents another send');
});
