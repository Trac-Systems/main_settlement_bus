import test from 'brittle';
import sinon from 'sinon';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import ValidatorConnectionManager from '../../../../src/core/network/services/ValidatorConnectionManager.js';
import IndexerConnectionManager from '../../../../src/core/network/services/IndexerConnectionManager.js';
import { NetworkResultCode } from '../../../../src/utils/constants.js';

const config = { addressPrefix: 'trac', validatorHealthCheckInterval: 100 };
const logger = { debug() {}, info() {}, warn() {}, error() {} };

function makeConnection(byte = 1) {
    const connection = new EventEmitter();
    connection.remotePublicKey = b4a.alloc(32, byte);
    connection.connected = true;
    connection.destroyed = false;
    connection.end = sinon.stub();
    connection.destroy = sinon.stub();
    connection.protocolSessions = {
        validator: {
            isProbed: () => true,
            probe: sinon.stub().resolves(),
            isHealthCheckSupported: () => true,
            sendHealthCheck: sinon.stub().resolves(NetworkResultCode.RESULT_CODE_OK),
        },
    };
    return connection;
}

function makeManager(role, max = 2) {
    const messages = {
        attachChannel: sinon.spy(connection => {
            if (role === 'indexer' && !connection.protocolSessions.indexer) {
                connection.protocolSessions.indexer = {
                    close() { delete connection.protocolSessions.indexer; },
                };
            }
        }),
    };
    const Manager = role === 'validator' ? ValidatorConnectionManager : IndexerConnectionManager;
    return { manager: new Manager(max, config, logger, messages), messages };
}

for (const role of ['validator', 'indexer']) {
    test(`${role}: repeated add/remove on a live transport does not retain close listeners`, async t => {
        const { manager } = makeManager(role);
        await manager.ready();
        t.teardown(() => manager.close());
        const connection = makeConnection();
        const otherListener = sinon.spy();
        connection.on('close', otherListener);
        let maxListeners = 0;
        for (let cycle = 0; cycle < 25; cycle++) {
            await manager.add(connection.remotePublicKey, connection);
            maxListeners = Math.max(maxListeners, connection.listenerCount('close'));
            manager.remove(connection.remotePublicKey);
        }
        t.is(maxListeners, 2, 'only one manager listener is attached at a time');
        t.alike(connection.rawListeners('close'), [otherListener], 'unrelated listener survives removal');
        t.is(manager.connectionCount(), 0);
        t.absent(connection.end.called || connection.destroy.called, 'shared transport remains open');
        connection.emit('close');
        t.ok(otherListener.calledOnce);
    });

    for (const cleanup of ['clear', 'close']) {
        test(`${role}: ${cleanup} releases connections, listeners and health checks`, async t => {
            const clock = sinon.useFakeTimers();
            const { manager } = makeManager(role);
            try {
                await manager.ready();
                const connections = [makeConnection(1), makeConnection(2)];
                const otherListener = () => {};
                for (const connection of connections) {
                    connection.on('close', otherListener);
                    await manager.add(connection.remotePublicKey, connection);
                }
                t.is(clock.countTimers(), role === 'validator' ? 2 : 0);
                await manager[cleanup]();
                t.is(manager.connectionCount(), 0);
                t.is(clock.countTimers(), 0, 'no health check intervals remain');
                for (const connection of connections) {
                    t.alike(connection.rawListeners('close'), [otherListener]);
                    t.absent(connection.end.called || connection.destroy.called);
                }
            } finally {
                await manager.close();
                clock.restore();
            }
        });
    }

    test(`${role}: a late close callback cannot detach the replacement connection`, async t => {
        const { manager } = makeManager(role);
        await manager.ready();
        t.teardown(() => manager.close());
        const old = makeConnection();
        await manager.add(old.remotePublicKey, old);
        const [oldClose] = old.rawListeners('close');
        manager.remove(old.remotePublicKey);
        const replacement = makeConnection();
        await manager.add(replacement.remotePublicKey, replacement);
        oldClose();
        t.is(old.listenerCount('close'), 0);
        t.is(manager.getConnection(old.remotePublicKey), replacement);
        t.is(replacement.listenerCount('close'), 1);
        replacement.emit('close');
        t.absent(manager.exists(replacement.remotePublicKey));
        t.is(replacement.listenerCount('close'), 0);
    });

    for (const interruption of ['transport', 'manager']) {
        test(`${role}: pending admission cannot register a closed ${interruption}`, async t => {
            const clock = sinon.useFakeTimers();
            const { manager, messages } = makeManager(role);
            try {
                await manager.ready();
                const connection = makeConnection();
                let finish;
                const pending = new Promise(resolve => { finish = resolve; });
                if (role === 'validator') {
                    connection.protocolSessions.validator.isProbed = () => false;
                    connection.protocolSessions.validator.probe = () => pending;
                } else {
                    const attach = messages.attachChannel;
                    messages.attachChannel = async candidate => { await pending; attach(candidate); };
                }
                const adding = manager.add(connection.remotePublicKey, connection);
                if (interruption === 'manager') await manager.close();
                else {
                    connection.destroyed = true;
                    connection.connected = false;
                    connection.emit('close');
                }
                finish();
                await adding;
                t.absent(manager.exists(connection.remotePublicKey));
                t.is(connection.listenerCount('close'), 0);
                t.is(clock.countTimers(), 0, 'late admission did not start health checks');
                if (role === 'indexer') t.absent(connection.protocolSessions.indexer, 'late channel is closed');
            } finally {
                await manager.close();
                clock.restore();
            }
        });
    }

    test(`${role}: add after close does not attach a channel`, async t => {
        const { manager, messages } = makeManager(role);
        await manager.ready();
        await manager.close();
        const connection = makeConnection();
        await manager.add(connection.remotePublicKey, connection);
        t.absent(messages.attachChannel.called);
        t.absent(manager.exists(connection.remotePublicKey));
        t.is(connection.listenerCount('close'), 0);
    });
}

test('validator: a rejected probe on a closed transport cannot leave a legacy entry', async t => {
    const { manager } = makeManager('validator');
    await manager.ready();
    t.teardown(() => manager.close());
    const connection = makeConnection();
    let rejectProbe;
    connection.protocolSessions.validator.isProbed = () => false;
    connection.protocolSessions.validator.isHealthCheckSupported = () => false;
    connection.protocolSessions.validator.probe = () => new Promise((_, reject) => { rejectProbe = reject; });
    const adding = manager.add(connection.remotePublicKey, connection);
    connection.destroyed = true;
    connection.emit('close');
    rejectProbe(new Error('Connection closed before response'));
    await adding;
    t.absent(manager.exists(connection.remotePublicKey));
    t.is(connection.listenerCount('close'), 0);
});

test('validator: a full pool does not schedule health checks for an untracked transport', async t => {
    const clock = sinon.useFakeTimers();
    const { manager } = makeManager('validator', 0);
    try {
        await manager.ready();
        const connection = makeConnection();
        await manager.add(connection.remotePublicKey, connection);
        t.absent(manager.exists(connection.remotePublicKey));
        t.is(connection.listenerCount('close'), 0);
        t.is(clock.countTimers(), 0);
    } finally {
        await manager.close();
        clock.restore();
    }
});
