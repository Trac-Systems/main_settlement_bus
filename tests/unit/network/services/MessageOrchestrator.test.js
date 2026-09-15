import { hook, test } from 'brittle';
import sinon from 'sinon';
import MessageOrchestrator from '../../../../src/core/network/services/MessageOrchestrator.js';
import State from '../../../../src/core/state/State.js';
import { OperationType, ResultCode } from '../../../../src/utils/constants.js';
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4 } from '../../../fixtures/apply.fixtures.js';
import { publicKeyToAddress } from '../../../../src/utils/helpers.js';
import { ConnectionManagerError } from '../../../../src/core/network/services/ConnectionManager.js';
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

const createRotatingConnectionManager = (options = {}) => {
    let validators = options.connectedValidators ?? [VALIDATOR_KEY, testKeyPair3.publicKey, testKeyPair4.publicKey];
    const connectionManager = createConnectionManager(options);
    connectionManager.connectedValidators.callsFake(() => validators);
    connectionManager.remove.callsFake(publicKey => {
        validators = validators.filter(key => key !== publicKey);
    });
    return connectionManager;
};

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

for (const resultCode of [ResultCode.TIMEOUT, ResultCode.NODE_OVERLOADED, ResultCode.NODE_HAS_NO_WRITE_ACCESS, ResultCode.RATE_LIMITED]) {
    test(`MessageOrchestrator.send retries temporary result ${resultCode} with another validator`, async t => {
        const sendSingleMessage = sinon.stub();
        sendSingleMessage.onFirstCall().resolves(resultCode);
        sendSingleMessage.onSecondCall().resolves(ResultCode.OK);
        const connectionManager = createRotatingConnectionManager({ sendSingleMessage });
        const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
        const wallet = await createWallet(config);
        const message = createTransferMessage(config, wallet);

        orchestrator.setWallet(wallet);
        const result = await orchestrator.send(message);

        t.is(result, true);
        t.is(sendSingleMessage.callCount, 2);
        t.is(sendSingleMessage.firstCall.args[1], VALIDATOR_KEY);
        t.is(sendSingleMessage.secondCall.args[1], testKeyPair3.publicKey);
        t.is(connectionManager.remove.callCount, 1);
        t.alike(connectionManager.remove.firstCall.args[1], { endConnection: resultCode === ResultCode.RATE_LIMITED });
        t.is(connectionManager.incrementSentCount.callCount, 1);
        t.is(connectionManager.incrementSentCount.firstCall.args[0], testKeyPair3.publicKey);
        t.alike(
            sendSingleMessage.secondCall.args[0].broadcast_transaction_request.data,
            sendSingleMessage.firstCall.args[0].broadcast_transaction_request.data,
            'retry preserves the encoded transaction'
        );
        t.not(sendSingleMessage.secondCall.args[0].id, sendSingleMessage.firstCall.args[0].id);
    });
}

test('MessageOrchestrator.send returns false after a timeout when no other validators remain', async t => {
    const connectionManager = createRotatingConnectionManager({
        sendSingleMessage: sinon.stub().resolves(ResultCode.TIMEOUT),
        connectedValidators: [VALIDATOR_KEY],
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
    t.alike(connectionManager.remove.firstCall.args[1], { endConnection: false });
});

test('MessageOrchestrator.send legacy success rotation preserves the replication socket', async t => {
    const connectionManager = createConnectionManager({ preferredProtocol: 'legacy', sentCount: config.messageThreshold });
    const orchestrator = new MessageOrchestrator(connectionManager, { waitForUnsigned: async () => true }, config);
    const wallet = await createWallet(config);
    orchestrator.setWallet(wallet);

    t.is(await orchestrator.send(createTransferMessage(config, wallet)), true);
    t.alike(connectionManager.remove.firstCall.args, [VALIDATOR_KEY, { endConnection: false }]);
});

for (const code of [ResultCode.REQUESTER_NOT_FOUND, ResultCode.INSUFFICIENT_FEE_BALANCE, ResultCode.EXTERNAL_BOOTSTRAP_NOT_DEPLOYED]) {
    test(`MessageOrchestrator.send preserves replication after state rejection ${code}`, async t => {
        const connectionManager = createConnectionManager({ sendSingleMessage: sinon.stub().resolves(code) });
        const orchestrator = new MessageOrchestrator(connectionManager, {}, config);
        const wallet = await createWallet(config);
        orchestrator.setWallet(wallet);

        t.is(await orchestrator.send(createTransferMessage(config, wallet)), false);
        t.is(connectionManager.sendSingleMessage.callCount, 1);
        t.is(connectionManager.remove.callCount, 0);
    });
}

for (const visible of [true, false]) {
    test(`MessageOrchestrator.send recovers an accepted transaction without proof (visible: ${visible})`, async t => {
        const sendSingleMessage = sinon.stub();
        sendSingleMessage.onFirstCall().resolves(ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE);
        sendSingleMessage.onSecondCall().resolves(ResultCode.OK);
        const connectionManager = createRotatingConnectionManager({ sendSingleMessage });
        const state = { waitForUnsigned: sinon.stub().resolves(visible) };
        const orchestrator = new MessageOrchestrator(connectionManager, state, config);
        const wallet = await createWallet(config);
        const message = createTransferMessage(config, wallet);
        orchestrator.setWallet(wallet);

        t.is(await orchestrator.send(message), true);
        t.alike(state.waitForUnsigned.firstCall.args, [message.tro.tx, config.messageValidatorResponseTimeout]);
        t.is(sendSingleMessage.callCount, visible ? 1 : 2);
        t.is(connectionManager.remove.callCount, visible ? 0 : 1);
        if (!visible) t.alike(connectionManager.remove.firstCall.args[1], { endConnection: false });
    });
}

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

test('MessageOrchestrator.send stops temporary-failure retries at maxRetries with validators still available', async t => {
    const config = overrideConfig({ maxRetries: 1 });
    const sendSingleMessage = sinon.stub().resolves(ResultCode.TIMEOUT);
    const connectionManager = createRotatingConnectionManager({ sendSingleMessage });
    const orchestrator = new MessageOrchestrator(connectionManager, { get: async () => null }, config);
    const wallet = await createWallet(config);
    const message = createTransferMessage(config, wallet);

    orchestrator.setWallet(wallet);
    const result = await orchestrator.send(message);

    t.is(result, false);
    t.is(sendSingleMessage.callCount, 2);
    t.is(connectionManager.remove.callCount, 2);
    t.alike(connectionManager.connectedValidators(), [testKeyPair4.publicKey]);
});

for (const visible of [true, false]) {
    test(`MessageOrchestrator.send verifies an already-existing transaction after timeout retry (visible: ${visible})`, async t => {
        const sendSingleMessage = sinon.stub();
        sendSingleMessage.onFirstCall().resolves(ResultCode.TIMEOUT);
        sendSingleMessage.onSecondCall().resolves(ResultCode.TX_ALREADY_EXISTS);
        const connectionManager = createRotatingConnectionManager({ sendSingleMessage });
        const state = { waitForUnsigned: sinon.stub().resolves(visible) };
        const orchestrator = new MessageOrchestrator(connectionManager, state, config);
        const wallet = await createWallet(config);
        const message = createTransferMessage(config, wallet);

        orchestrator.setWallet(wallet);
        const result = await orchestrator.send(message);

        t.is(result, visible);
        t.is(sendSingleMessage.callCount, 2);
        t.is(state.waitForUnsigned.callCount, 1);
        t.alike(state.waitForUnsigned.firstCall.args, [message.tro.tx, config.messageValidatorResponseTimeout]);
        t.is(connectionManager.incrementSentCount.callCount, 0);
    });
}

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
    const connectionManager = createRotatingConnectionManager({ sendSingleMessage });
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

test('State.waitForUnsigned deadline includes a stalled state read', async t => {
    const clock = sinon.useFakeTimers({ now: 1 });
    let finishRead;
    const state = { get: sinon.stub().returns(new Promise(resolve => { finishRead = resolve; })) };
    try {
        const result = State.prototype.waitForUnsigned.call(state, 'tx-hash', 400);
        await clock.tickAsync(401);
        t.is(await result, false);
        t.is(state.get.callCount, 1);
        t.ok(state.get.firstCall.args[1].timeout <= 400);
        finishRead(null);
        await clock.tickAsync(1000);
        t.is(state.get.callCount, 1, 'polling stops after the deadline even if the read finishes later');
    } finally {
        finishRead(null);
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
