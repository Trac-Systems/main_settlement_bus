import { hook, test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import ValidatorMessageOrchestrator from '../../../../src/core/network/services/ValidatorMessageOrchestrator.js';
import ValidatorConnectionManager from '../../../../src/core/network/services/ValidatorConnectionManager.js';
import State from '../../../../src/core/state/State.js';
import { OperationType, NetworkResultCode, NetworkOperationType } from '../../../../src/utils/constants.js';
import { testKeyPair1, testKeyPair2, testKeyPair3 } from '../../../fixtures/apply.fixtures.js';
import { publicKeyToAddress } from '../../../../src/utils/helpers.js';
import { PeerConnectionManagerError } from '../../../../src/core/network/shared/PeerConnectionManager.js';
import ValidatorPendingRequestService, { ValidatorPendingRequestServiceTimeoutError } from '../../../../src/core/network/protocols/validators/v1/ValidatorPendingRequestService.js';
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

const createValidatorConnectionManager = ({
    preferredProtocol = 'v1',
    sendSingleMessage = sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OK),
    sentCount = 0,
    connectedPeers = [VALIDATOR_KEY],
} = {}) => ({
    connectedPeers: sinon.stub().returns(connectedPeers),
    getConnection: sinon.stub().returns({
        protocolSessions: {
            validator: {
                preferredProtocol,
                supportedProtocols: {
                    LEGACY: 'legacy',
                    V1: 'v1',
                }
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
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

async function createReplacementContext(t, { preferredProtocol = 'v1', messageThreshold = 1000 } = {}) {
    const config = overrideConfig({ maxRetries: 1, messageThreshold });
    const wallet = await createWallet(config);
    const pending = new ValidatorPendingRequestService(config);
    const manager = new ValidatorConnectionManager(2, config, { debug() {} }, { attachChannel() {} });
    await manager.ready();
    t.teardown(async () => { pending.close(); await manager.close(); });
    const state = { isValidatorAddress: async () => true, waitForUnsigned: sinon.stub().resolves(true) };
    const orchestrator = new ValidatorMessageOrchestrator(manager, state, config, wallet);
    const open = (replyImmediately = false, protocol = preferredProtocol) => {
        const sent = deferred();
        const requests = [];
        const connection = new EventEmitter();
        connection.remotePublicKey = b4a.from(VALIDATOR_KEY, 'hex');
        connection.protocolSessions = {
            validator: {
                preferredProtocol: protocol,
                supportedProtocols: { LEGACY: 'legacy', V1: 'v1' },
                isProbed: () => true,
                isHealthCheckSupported: () => false,
                send(message) {
                    requests.push(message);
                    const result = protocol === 'v1'
                        ? pending.registerPendingRequest(VALIDATOR_KEY, message, connection)
                        : Promise.resolve(null);
                    if (replyImmediately && protocol === 'v1') {
                        pending.resolvePendingRequest(message.id, NetworkResultCode.RESULT_CODE_OK);
                    }
                    sent.resolve();
                    return result;
                },
            },
        };
        return { connection, sent, requests };
    };
    const replace = async (old, replacement) => {
        manager.remove(VALIDATOR_KEY, old.connection);
        await manager.add(VALIDATOR_KEY, replacement.connection);
    };
    return { manager, pending, state, orchestrator, open, replace, message: createTransferMessage(config, wallet) };
}

// A dedicated sandbox instead of sinon's global default one: sinon.stub/sinon.restore()
// operate on shared global state, so another test file's teardown calling sinon.restore()
// while this file's console stubs are still active (or vice versa) can yank them out from
// under each other mid-run. A sandbox's restore() only ever touches its own stubs.
let consoleSandbox;

hook('setup', () => {
    consoleSandbox = sinon.createSandbox();
    consoleSandbox.stub(console, 'log');
    consoleSandbox.stub(console, 'warn');
});

hook('teardown', () => {
    consoleSandbox.restore();
});

for (const message of ['connection reset by peer', 'connection timed out', 'Duplicate connection']) {
    test(`ValidatorMessageOrchestrator retries ${message} through the replacement without evicting it`, async t => {
        const context = await createReplacementContext(t);
        const { manager, pending, orchestrator, open, replace } = context;
        const old = open();
        await manager.add(VALIDATOR_KEY, old.connection);
        const result = orchestrator.send(context.message);
        await old.sent.promise;
        const replacement = open(true);
        await replace(old, replacement);
        const parallel = pending.registerPendingRequest(VALIDATOR_KEY, {
            id: 'replacement-health-check', type: NetworkOperationType.LIVENESS_REQUEST,
        }, replacement.connection);

        t.is(pending.rejectPendingRequestsForConnection(old.connection, new Error(message)), 1);
        t.ok(await result, 'retry succeeds through the replacement');
        t.is(manager.getConnection(VALIDATOR_KEY), replacement.connection, 'replacement stays tracked after the old rejection');
        t.ok(pending.has('replacement-health-check'), 'another request on the replacement survives');
        t.is(replacement.requests.length, 1, 'one retry is sent');
        if (replacement.requests.length) {
            t.absent(replacement.requests[0].id === old.requests[0].id, 'retry has a fresh request ID');
            t.alike(replacement.requests[0].broadcast_transaction_request.data,
                old.requests[0].broadcast_transaction_request.data, 'retry carries the same transaction');
        }
        pending.resolvePendingRequest('replacement-health-check', NetworkResultCode.RESULT_CODE_OK);
        await parallel;
    });
}

for (const resultCode of [NetworkResultCode.RESULT_CODE_OK, NetworkResultCode.RESULT_CODE_TIMEOUT, 99999]) {
    test(`ValidatorMessageOrchestrator keeps the replacement when an old request returns ${resultCode}`, async t => {
        const { manager, pending, orchestrator, open, replace, message } = await createReplacementContext(t, { messageThreshold: 1 });
        const old = open();
        await manager.add(VALIDATOR_KEY, old.connection);
        const result = orchestrator.send(message);
        await old.sent.promise;
        const replacement = open();
        await replace(old, replacement);
        pending.resolvePendingRequest(old.requests[0].id, resultCode);

        t.is(await result, resultCode === NetworkResultCode.RESULT_CODE_OK);
        t.is(manager.getConnection(VALIDATOR_KEY), replacement.connection);
        t.is(manager.getSentCount(VALIDATOR_KEY), 0, 'old success does not advance the replacement rotation counter');
    });
}

for (const appeared of [true, false]) {
    test(`ValidatorMessageOrchestrator keeps the replacement after a legacy state wait returns ${appeared}`, async t => {
        const { manager, state, orchestrator, open, replace, message } = await createReplacementContext(t, {
            preferredProtocol: 'legacy', messageThreshold: appeared ? 1 : 1000,
        });
        const waiting = deferred();
        const outcome = deferred();
        state.waitForUnsigned.onFirstCall().callsFake(() => { waiting.resolve(); return outcome.promise; });
        const old = open();
        await manager.add(VALIDATOR_KEY, old.connection);
        const result = orchestrator.send(message);
        await waiting.promise;
        const replacement = open();
        await replace(old, replacement);
        outcome.resolve(appeared);

        t.ok(await result);
        t.is(manager.getConnection(VALIDATOR_KEY), replacement.connection);
        t.is(replacement.requests.length, appeared ? 0 : 1);
        t.is(manager.getSentCount(VALIDATOR_KEY), appeared ? 0 : 1);
    });
}

test('ValidatorMessageOrchestrator reselects the protocol when the connection changes while building a request', async t => {
    const { manager, orchestrator, open, replace, message } = await createReplacementContext(t);
    const old = open();
    const replacement = open(true, 'legacy');
    await manager.add(VALIDATOR_KEY, old.connection);
    const getConnection = manager.getConnection.bind(manager);
    let replacementTask;
    const lookup = sinon.stub(manager, 'getConnection').callsFake(publicKey => {
        const connection = getConnection(publicKey);
        if (connection === old.connection && !replacementTask) {
            replacementTask = Promise.resolve().then(() => replace(old, replacement));
        }
        return connection;
    });
    t.teardown(() => lookup.restore());

    t.ok(await orchestrator.send(message));
    await replacementTask;
    t.is(old.requests.length, 0, 'does not send through the superseded transport');
    t.is(replacement.requests.length, 1);
    t.is(replacement.requests[0], message, 'legacy replacement receives the canonical operation, not a v1 envelope');
    t.is(manager.getConnection(VALIDATOR_KEY), replacement.connection);
});

for (const preferredProtocol of ['v1', 'legacy']) {
    test(`ValidatorMessageOrchestrator.send ${preferredProtocol} skips a peer promoted to indexer before observer runs`, async t => {
        const indexerKey = testKeyPair3.publicKey;
        const manager = createValidatorConnectionManager({
            preferredProtocol,
            connectedPeers: [indexerKey, VALIDATOR_KEY],
        });
        const state = {
            isValidatorAddress: async address => address === publicKeyToAddress(VALIDATOR_KEY, config),
            waitForUnsigned: async () => true,
        };
        const wallet = await createWallet(config);
        const orchestrator = new ValidatorMessageOrchestrator(manager, state, config, wallet);
        const random = sinon.stub(Math, 'random').returns(0);
        try {
            t.ok(await orchestrator.send(createTransferMessage(config, wallet)));
            t.is(manager.remove.callCount, 1);
            t.is(manager.remove.firstCall.args[0], indexerKey);
            t.is(manager.sendSingleMessage.callCount, 1, 'never sends a request to the indexer');
            t.is(manager.sendSingleMessage.firstCall.args[1], VALIDATOR_KEY);
        } finally {
            random.restore();
        }
    });
}

test('ValidatorMessageOrchestrator.send returns false when every cached peer has lost eligibility', async t => {
    const manager = createValidatorConnectionManager({ connectedPeers: [testKeyPair3.publicKey, VALIDATOR_KEY] });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(manager, { isValidatorAddress: async () => false }, config, wallet);
    t.absent(await orchestrator.send(createTransferMessage(config, wallet)));
    t.is(manager.sendSingleMessage.callCount, 0);
    t.is(manager.remove.callCount, 2);
});

test('ValidatorMessageOrchestrator.send returns false for unsupported protocol', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({ preferredProtocol: 'unknown' });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message, 0);

    t.is(result, false);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 0);
});

test('ValidatorMessageOrchestrator.send V1 matrix: OK -> SUCCESS', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OK),
        sentCount: 0,
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 0);
});

test('ValidatorMessageOrchestrator.send V1 matrix: TIMEOUT -> ROTATE', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_TIMEOUT),
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 1);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 0);
});

test('ValidatorMessageOrchestrator.send V1 matrix: TX_ALREADY_PENDING -> NO_ROTATE', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_TX_ALREADY_PENDING),
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 0);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 0);
});

test('ValidatorMessageOrchestrator.send treats TX_ALREADY_EXISTS as success when tx is already visible locally', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_TX_ALREADY_EXISTS),
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    sinon.stub(orchestrator, 'waitForUnsignedState').resolves(true);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 0);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 0);
});

test('ValidatorMessageOrchestrator.send treats OPERATION_ALREADY_COMPLETED as success when tx is already visible locally', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OPERATION_ALREADY_COMPLETED),
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    sinon.stub(orchestrator, 'waitForUnsignedState').resolves(true);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 0);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 0);
});

test('ValidatorMessageOrchestrator.send V1 matrix: unknown code -> UNDEFINED', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(99999),
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send removes validator when threshold reached on success', async t => {
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OK),
        sentCount: config.messageThreshold,
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send retries on PeerConnectionManagerError without removing validator', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new PeerConnectionManagerError('disconnected'));
    sendSingleMessage.onSecondCall().resolves(NetworkResultCode.RESULT_CODE_OK);

    const validatorConnectionManager = createValidatorConnectionManager({ sendSingleMessage, sentCount: 0 });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(validatorConnectionManager.remove.callCount, 0);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 1);
});

test('ValidatorMessageOrchestrator.send retries on generic catch error with remove + retry', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new Error('response validation failed'));
    sendSingleMessage.onSecondCall().resolves(NetworkResultCode.RESULT_CODE_OK);

    const validatorConnectionManager = createValidatorConnectionManager({ sendSingleMessage, sentCount: 0 });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(validatorConnectionManager.remove.callCount, 1);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 1);
});

test('ValidatorMessageOrchestrator.send max retries guard returns false immediately', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OK),
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message, 2);

    t.is(result, false);
    t.is(validatorConnectionManager.connectedPeers.callCount, 0);
    t.is(validatorConnectionManager.sendSingleMessage.callCount, 0);
});

test('ValidatorMessageOrchestrator.send timeout split: pending timeout rejection goes through catch and retries', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(
        new ValidatorPendingRequestServiceTimeoutError('req-1', publicKeyToAddress(VALIDATOR_KEY, config), config.pendingRequestTimeout)
    );
    sendSingleMessage.onSecondCall().resolves(NetworkResultCode.RESULT_CODE_OK);

    const validatorConnectionManager = createValidatorConnectionManager({ sendSingleMessage });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send timeout split: TIMEOUT result code stays in then path and does not retry', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub().resolves(NetworkResultCode.RESULT_CODE_TIMEOUT);
    const validatorConnectionManager = createValidatorConnectionManager({ sendSingleMessage });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send validation split: thrown validation error goes through catch', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new Error('validator response validation failed'));
    sendSingleMessage.onSecondCall().resolves(NetworkResultCode.RESULT_CODE_OK);

    const validatorConnectionManager = createValidatorConnectionManager({ sendSingleMessage });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send validation split: non-OK result code stays in then and uses policy', async t => {
    const config = overrideConfig({ maxRetries: 2 });
    const sendSingleMessage = sinon.stub().resolves(NetworkResultCode.RESULT_CODE_SCHEMA_VALIDATION_FAILED);
    const validatorConnectionManager = createValidatorConnectionManager({ sendSingleMessage });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(sendSingleMessage.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send legacy path succeeds and increments sent count', async t => {
    const config = overrideConfig({ maxRetries: 0 });
    const sendSingleMessage = sinon.stub().resolves(true);
    const state = { isValidatorAddress: async () => true, waitForUnsigned: sinon.stub().resolves(true) };
    const validatorConnectionManager = createValidatorConnectionManager({
        preferredProtocol: 'legacy',
        sendSingleMessage,
        sentCount: 0,
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, state, config);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 1);
    t.is(state.waitForUnsigned.callCount, 1);
    t.is(validatorConnectionManager.incrementSentCount.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 0);
});

test('ValidatorMessageOrchestrator.send legacy path false result removes validator and retries', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const sendSingleMessage = sinon.stub().resolves(true);
    const state = { isValidatorAddress: async () => true, waitForUnsigned: sinon.stub() };
    state.waitForUnsigned.onFirstCall().resolves(false);
    state.waitForUnsigned.onSecondCall().resolves(true);
    const validatorConnectionManager = createValidatorConnectionManager({
        preferredProtocol: 'legacy',
        sendSingleMessage,
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, state, config);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(state.waitForUnsigned.callCount, 2);
    t.is(validatorConnectionManager.remove.callCount, 1);
});

test('ValidatorMessageOrchestrator.send legacy path catches send error and retries', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const sendSingleMessage = sinon.stub();
    sendSingleMessage.onFirstCall().rejects(new Error('legacy send failed'));
    sendSingleMessage.onSecondCall().resolves(true);
    const state = { isValidatorAddress: async () => true, waitForUnsigned: sinon.stub().resolves(true) };

    const validatorConnectionManager = createValidatorConnectionManager({
        preferredProtocol: 'legacy',
        sendSingleMessage,
    });
    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, state, config);
    const message = createTransferMessage(config, wallet);
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 2);
    t.is(state.waitForUnsigned.callCount, 1);
    t.is(validatorConnectionManager.remove.callCount, 0);
});

test('ValidatorMessageOrchestrator respects maxRetries when legacy sends keep failing', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const wallet = await createWallet(config);
    const sendSingleMessage = sinon.stub().rejects(new Error('connection reset by peer'));
    const manager = createValidatorConnectionManager({ preferredProtocol: 'legacy', sendSingleMessage });
    const state = { isValidatorAddress: async () => true };
    const orchestrator = new ValidatorMessageOrchestrator(manager, state, config);

    t.is(await orchestrator.send(createTransferMessage(config, wallet)), false);
    t.is(sendSingleMessage.callCount, 2, 'one initial send and one retry');
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

test('ValidatorMessageOrchestrator.send V1 avoids selecting validator with requester address when possible', async t => {
    const requesterValidatorKey = testKeyPair1.publicKey;
    const otherValidatorKey = testKeyPair2.publicKey;
    const sendSingleMessage = sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OK);

    const validatorConnectionManager = createValidatorConnectionManager({
        sendSingleMessage,
        connectedPeers: [requesterValidatorKey, otherValidatorKey],
    });
    validatorConnectionManager.getConnection = sinon.stub().returns({
        protocolSessions: {
            validator: {
                preferredProtocol: 'v1',
                supportedProtocols: {
                    LEGACY: 'legacy',
                    V1: 'v1',
                }
            }
        }
    });

    const wallet = await createWallet(config);
    const orchestrator = new ValidatorMessageOrchestrator(validatorConnectionManager, { get: async () => null, isValidatorAddress: async () => true }, config, wallet);
    const requesterAddress = publicKeyToAddress(requesterValidatorKey, config);
    const message = {
        ...createTransferMessage(config, wallet),
        address: requesterAddress,
    };
    const result = await orchestrator.send(message);

    t.is(result, true);
    t.is(sendSingleMessage.callCount, 1);
    t.is(sendSingleMessage.firstCall.args[1], otherValidatorKey);
});
