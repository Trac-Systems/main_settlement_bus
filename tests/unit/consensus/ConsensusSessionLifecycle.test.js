import test from 'brittle';
import b4a from 'b4a';
import Protomux from 'protomux';
import c from 'compact-encoding';
import EventEmitter from 'bare-events';
import ConsensusMessages from '../../../src/core/consensus/protocols/ConsensusMessages.js';
import IndexerConnectionManager from '../../../src/core/consensus/services/IndexerConnectionManager.js';
import IndexerPendingRequestService from '../../../src/core/consensus/services/IndexerPendingRequestService.js';
import { encodeConsensusMessage } from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import fixtures from '../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../helpers/config.js';

const peerKey = b4a.alloc(32, 1);
const proposal = id => ({ ...fixtures.proofProposalHeader, session_id: id });

function setup(t) {
    const pending = new IndexerPendingRequestService(config);
    let manager;
    const state = new EventEmitter();
    state.isIndexerAddress = async () => true;
    const messages = new ConsensusMessages(state, {}, config, pending, connection => {
        manager.remove(connection.remotePublicKey, connection);
    });
    manager = new IndexerConnectionManager(10, config, { debug() {} }, messages);
    t.teardown(() => pending.close());
    return { pending, manager, messages };
}

async function openSession(t, context) {
    const { Duplex } = await import('node:stream');
    let remote;
    const local = new Duplex({
        objectMode: true,
        read() {},
        write(data, _encoding, callback) { remote.push(data); callback(); }
    });
    remote = new Duplex({
        objectMode: true,
        read() {},
        write(data, _encoding, callback) { local.push(data); callback(); }
    });
    local.userData = null;
    remote.userData = null;
    local.remotePublicKey = peerKey;
    local.connected = true;
    t.teardown(() => { local.destroy(); remote.destroy(); });

    const localMux = Protomux.from(local);
    const remoteMux = Protomux.from(remote);
    localMux.cork();
    remoteMux.cork();
    const remoteConsensus = remoteMux.createChannel({ protocol: 'consensus/v1' });
    const remoteSender = remoteConsensus.addMessage({ encoding: c.raw });
    await context.manager.add(peerKey, local);
    remoteConsensus.open();

    let receive;
    const received = new Promise(resolve => { receive = resolve; });
    const localOther = localMux.createChannel({ protocol: 'other-channel' });
    const remoteOther = remoteMux.createChannel({ protocol: 'other-channel' });
    const otherSender = localOther.addMessage({ encoding: c.raw });
    remoteOther.addMessage({ encoding: c.raw, onmessage: receive });
    localOther.open();
    remoteOther.open();
    localMux.uncork();
    remoteMux.uncork();
    t.ok(await remoteConsensus.fullyOpened(), 'consensus channel opened');
    t.ok(await remoteOther.fullyOpened(), 'other channel opened');
    return { local, remote, session: local.protocolSessions.indexer, remoteConsensus, remoteSender, otherSender, received };
}

if (typeof globalThis.Bare !== 'undefined') {
    test('Consensus session lifecycle uses Node duplex streams', t => t.pass('covered in Node'));
} else {
    for (const closer of ['session', 'manager', 'remote', 'transport', 'router', 'handler']) {
        test(`Consensus session cleanup after closure by ${closer}`, async t => {
            const context = setup(t);
            const { local, remote, session, remoteConsensus, remoteSender, otherSender, received } = await openSession(t, context);
            const result = session.send(proposal('pending')).catch(error => error);
            const validatorSession = { active: true };
            local.protocolSessions.validator = validatorSession;

            if (closer === 'session') session.close();
            if (closer === 'manager') context.manager.remove(peerKey, local);
            if (closer === 'remote') remoteConsensus.close();
            if (closer === 'transport') local.destroy();
            if (closer === 'router') remoteSender.send(b4a.from([0xff]));
            if (closer === 'handler') remoteSender.send(encodeConsensusMessage(proposal('')));

            t.ok((await result).message.includes('Consensus session closed'));
            t.absent(context.pending.has('pending'), 'request removed immediately');
            t.absent(local.protocolSessions.indexer, 'closed session reference removed');
            t.absent(context.manager.exists(peerKey), 'closed consensus entry removed');
            t.is(local.protocolSessions.validator, validatorSession, 'other session reference preserved');
            t.ok(session.closed);
            session.close(); // Cleanup is safe when repeated.
            await t.exception(() => session.send(proposal('late')), /session is closed/);
            t.absent(context.pending.has('late'), 'closed sessions cannot register requests');

            if (closer !== 'transport') {
                t.absent(local.destroyed, 'transport remains open');
                t.absent(local.writableEnded, 'transport write side remains open');
                otherSender.send(b4a.from('still replicating'));
                t.is(b4a.toString(await received), 'still replicating', 'other channel still transfers data');
                await remoteConsensus.fullyClosed();
                Protomux.from(remote).pair({ protocol: 'consensus/v1' }, () => {
                    const channel = Protomux.from(remote).createChannel({ protocol: 'consensus/v1' });
                    channel.addMessage({ encoding: c.raw });
                    channel.open();
                });
                await context.manager.add(peerKey, local);
                t.ok(local.protocolSessions.indexer, 'a new consensus session can be attached');
                t.absent(local.protocolSessions.indexer === session, 'the closed session is not reused');
            }
        });
    }

    test('Closing an old transport session preserves requests and manager entry for its replacement', async t => {
        const context = setup(t);
        const old = await openSession(t, context);
        const oldResult = old.session.send(proposal('old')).catch(error => error);
        context.manager.clear();
        const replacement = await openSession(t, context);
        const newResult = replacement.session.send(proposal('new'));

        old.session.close();

        t.ok((await oldResult).message.includes('Consensus session closed'));
        t.ok(context.pending.has('new'), 'same peer, different session request survives');
        t.is(context.manager.getConnection(peerKey), replacement.local, 'replacement manager entry survives');
        t.is(replacement.local.protocolSessions.indexer, replacement.session);
        context.pending.resolvePendingRequest('new', 'approved');
        t.is(await newResult, 'approved');
    });

    test('Closing an old session cannot remove a newer session reference on the same connection', async t => {
        const context = setup(t);
        const { local, session } = await openSession(t, context);
        const replacement = { close() { t.fail('replacement must not be closed'); } };
        local.protocolSessions.indexer = replacement;

        session.close();

        t.is(local.protocolSessions.indexer, replacement);
        t.is(context.manager.getConnection(peerKey), local);
        // Remove the stand-in before teardown closes the transport.
        delete local.protocolSessions.indexer;
    });
}
