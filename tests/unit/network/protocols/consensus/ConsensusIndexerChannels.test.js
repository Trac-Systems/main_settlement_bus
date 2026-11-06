import test from 'brittle';
import sinon from 'sinon';
import Corestore from 'corestore';
import Protomux from 'protomux';
import c from 'compact-encoding';
import EventEmitter from 'bare-events';
import IndexerMessages from '../../../../../src/core/network/protocols/consensus/IndexerMessages.js';
import IndexerPendingRequestService from '../../../../../src/core/network/protocols/consensus/v1/IndexerPendingRequestService.js';
import { CustomEventType } from '../../../../../src/utils/constants.js';
import { encodeConsensusMessage } from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import fixtures from '../../../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../../../helpers/config.js';

async function setup(t) {
    const localStore = new Corestore(await t.tmp());
    const remoteStore = new Corestore(await t.tmp());
    const source = remoteStore.get({ name: 'replicated-data', valueEncoding: 'utf-8' });
    await source.ready();
    const replica = localStore.get({ key: source.key, valueEncoding: 'utf-8' });
    await replica.ready();
    const localStream = localStore.replicate(true);
    const remoteStream = remoteStore.replicate(false);
    const local = localStream.noiseStream;
    const remote = remoteStream.noiseStream;
    const errors = [];
    local.on('error', error => errors.push(error));
    remote.on('error', error => errors.push(error));
    localStream.pipe(remoteStream).pipe(localStream);
    await Promise.all([local.opened, remote.opened]);

    const state = new EventEmitter();
    // Membership visibility is modeled; transport, pairing and replication are real.
    state.isIndexerAddress = sinon.stub().resolves(false);
    const wallet = { sign: sinon.spy() };
    const received = sinon.spy();
    state.on(CustomEventType.EPOCH_PROPOSAL_RECEIVED, received);
    const pending = new IndexerPendingRequestService(config);
    let closeSession;
    const messages = new IndexerMessages(state, wallet, config, pending, () => closeSession?.());
    messages.prepareConnection(local);
    t.teardown(async () => {
        pending.close();
        localStream.destroy();
        remoteStream.destroy();
        await Promise.all([localStore.close(), remoteStore.close()]);
    });

    function requestChannel(sendProposal = false) {
        const channel = Protomux.from(remote).createChannel({ protocol: 'consensus/v1' });
        const sender = channel.addMessage({ encoding: c.raw });
        channel.open();
        if (sendProposal) sender.send(encodeConsensusMessage({ ...fixtures.proofProposalHeader, session_id: 'foreign-peer' }));
        return channel;
    }

    async function assertReplication(value) {
        const index = source.length;
        await source.append(value);
        t.is(await replica.get(index), value, 'a fresh block still replicates over the same transport');
        t.absent(local.destroyed);
        t.absent(remote.destroyed);
        t.alike(errors, []);
    }

    function nextSessionClose() {
        return new Promise(resolve => { closeSession = resolve; });
    }
    return { state, wallet, received, messages, local, remote, pending, requestChannel, assertReplication, nextSessionClose };
}

if (typeof globalThis.Bare !== 'undefined') {
    test('Indexer channel and replication scenarios run in Node', t => t.pass('covered in Node'));
} else {
    test('Foreign peer is refused before handling proposals; replication and a later admission still work', async t => {
        const context = await setup(t);
        const refused = context.requestChannel(true);
        t.is(await refused.fullyOpened(), false);
        t.absent(context.local.protocolSessions.indexer);
        t.absent(context.received.called, 'the consensus handler receives no proposal');
        t.absent(context.wallet.sign.called, 'no signed rejection is produced');
        await context.assertReplication('after refusal');

        context.state.isIndexerAddress.resolves(true);
        const accepted = context.requestChannel();
        t.is(await accepted.fullyOpened(), true, 'the original pairing callback accepts the next attempt');
        const session = context.local.protocolSessions.indexer;
        const pendingResult = context.pending.registerPendingRequest(
            context.local.remotePublicKey.toString('hex'),
            { ...fixtures.proofProposalHeader, session_id: 'cancel-on-close' }, session
        ).catch(error => error);
        const closed = context.nextSessionClose();
        accepted.close();
        await closed;
        t.ok((await pendingResult) instanceof Error, 'closing consensus rejects its pending request');
        t.absent(context.local.protocolSessions.indexer);
        await context.assertReplication('after channel close');

        context.state.isIndexerAddress.resolves(false);
        t.is(await context.requestChannel().fullyOpened(), false, 'a new attempt rechecks a demoted peer');
        await context.assertReplication('after demotion refusal');
    });

    test('A membership read failure rejects only consensus and can be retried on the same transport', async t => {
        const context = await setup(t);
        context.state.isIndexerAddress.rejects(new Error('BLOCK_NOT_AVAILABLE'));
        t.is(await context.requestChannel().fullyOpened(), false);
        t.absent(context.wallet.sign.called);
        await context.assertReplication('after storage error');
        context.state.isIndexerAddress.resolves(true);
        t.is(await context.requestChannel().fullyOpened(), true);
    });

    test('Local and remote consensus opens racing through admission share a single session', async t => {
        const context = await setup(t);
        context.state.isIndexerAddress.resolves(true);
        const createSession = sinon.spy(context.messages, 'createProtocolSession');
        t.teardown(() => createSession.restore());
        const localOpening = context.messages.attachChannel(context.local);
        const remoteChannel = context.requestChannel();
        await localOpening;
        t.is(await remoteChannel.fullyOpened(), true);
        t.ok(createSession.calledOnce);
        await context.assertReplication('after simultaneous opens');
    });

    test('Session cleanup tolerates a removed session container', async t => {
        const context = await setup(t);
        context.state.isIndexerAddress.resolves(true);
        t.is(await context.requestChannel().fullyOpened(), true);
        const session = context.local.protocolSessions.indexer;
        delete context.local.protocolSessions;
        session.close();
        t.absent(context.local.protocolSessions, 'closing an obsolete session does not recreate the container');
        await context.assertReplication('after obsolete session cleanup');
    });
}
