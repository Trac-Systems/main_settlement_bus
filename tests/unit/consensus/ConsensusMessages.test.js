import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import ConsensusMessages from '../../../src/core/consensus/protocols/ConsensusMessages.js';
import { config } from '../../helpers/config.js';

function setup(t) {
    const state = new EventEmitter();
    state.isIndexerAddress = sinon.stub().resolves(true);
    const messages = new ConsensusMessages(state, {}, config, {}, sinon.spy());
    const session = { closed: false };
    const createSession = sinon.stub(messages, 'createProtocolSession').returns(session);
    t.teardown(() => createSession.restore());
    const connection = { remotePublicKey: b4a.alloc(32, 1), destroyed: false, destroy: sinon.spy(), end: sinon.spy() };
    return { state, messages, connection, session, createSession };
}

test('Consensus messages preserve other channels while attaching an admitted session', async t => {
    const { messages, connection, session, createSession } = setup(t);
    const validator = {};
    const sessions = { validator };
    connection.protocolSessions = sessions;
    await messages.attachChannel(connection);
    t.is(connection.protocolSessions, sessions);
    t.is(sessions.validator, validator);
    t.is(sessions.indexer, session);
    t.ok(createSession.calledOnceWithExactly(connection));
    t.absent(connection.destroy.called);
    t.absent(connection.end.called);
});

for (const initial of [undefined, null]) {
    test(`Consensus messages initialize missing sessions (${initial})`, async t => {
        const { messages, connection, session } = setup(t);
        connection.protocolSessions = initial;
        await messages.attachChannel(connection);
        t.is(connection.protocolSessions.indexer, session);
    });
}

test('Consensus messages do no admission work on an already destroyed transport', async t => {
    const { state, messages, connection, createSession } = setup(t);
    connection.destroyed = true;
    await messages.attachChannel(connection);
    t.absent(state.isIndexerAddress.called);
    t.absent(createSession.called);
    t.absent(connection.protocolSessions);
});

test('Consensus messages reuse an existing session without another state read', async t => {
    const { state, messages, connection, createSession } = setup(t);
    const existing = {};
    connection.protocolSessions = { indexer: existing };
    await messages.attachChannel(connection);
    t.is(connection.protocolSessions.indexer, existing);
    t.absent(state.isIndexerAddress.called);
    t.absent(createSession.called);
});

test('Consensus messages refuse a foreign peer and admit a subsequent attempt after promotion', async t => {
    const { state, messages, connection, session, createSession } = setup(t);
    state.isIndexerAddress.resolves(false);
    await messages.attachChannel(connection);
    t.absent(createSession.called);
    t.absent(connection.protocolSessions.indexer);
    t.absent(connection.destroy.called);
    t.absent(connection.end.called);
    state.isIndexerAddress.resolves(true);
    await messages.attachChannel(connection);
    t.is(connection.protocolSessions.indexer, session);
});

test('Consensus messages do not create a session if the transport closes during admission', async t => {
    const { state, messages, connection, createSession } = setup(t);
    let finish;
    state.isIndexerAddress.returns(new Promise(resolve => { finish = resolve; }));
    const attaching = messages.attachChannel(connection);
    t.absent(createSession.called, 'admission is awaited');
    connection.destroyed = true;
    finish(true);
    await attaching;
    t.absent(createSession.called);
    t.absent(connection.protocolSessions.indexer);
});

test('Concurrent consensus opens create a single session even when checks finish out of order', async t => {
    const { state, messages, connection, session, createSession } = setup(t);
    let finishFirst;
    let finishSecond;
    state.isIndexerAddress.onFirstCall().returns(new Promise(resolve => { finishFirst = resolve; }));
    state.isIndexerAddress.onSecondCall().returns(new Promise(resolve => { finishSecond = resolve; }));
    const first = messages.attachChannel(connection);
    const second = messages.attachChannel(connection);
    finishSecond(true);
    await second;
    finishFirst(true);
    await first;
    t.ok(createSession.calledOnce);
    t.is(connection.protocolSessions.indexer, session);
});

test('Consensus messages do not register a session that was closed during construction', async t => {
    const { messages, connection, session } = setup(t);
    session.closed = true;
    await messages.attachChannel(connection);
    t.absent(connection.protocolSessions.indexer);
});

test('Consensus session construction errors are contained and a later attempt can succeed', async t => {
    const { messages, connection, session, createSession } = setup(t);
    const log = sinon.stub(console, 'error');
    t.teardown(() => log.restore());
    createSession.onFirstCall().throws(new Error('channel setup failed'));
    await messages.attachChannel(connection);
    t.absent(connection.protocolSessions.indexer);
    t.absent(connection.destroy.called);
    t.absent(connection.end.called);
    t.ok(log.calledOnce);
    t.ok(log.firstCall.args[0].includes('channel setup failed'));
    await messages.attachChannel(connection);
    t.is(connection.protocolSessions.indexer, session);
});
