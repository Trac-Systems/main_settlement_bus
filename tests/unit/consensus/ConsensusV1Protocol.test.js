import test from 'brittle';
import b4a from 'b4a';
import Protomux from 'protomux';
import c from 'compact-encoding';

if (typeof globalThis.Bare !== 'undefined') {
    test('ConsensusV1Protocol shared transport coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('ConsensusV1Protocol keeps other channels and later messages working after a router error', async t => {
        const { Duplex } = await import('node:stream');
        const { default: esmock } = await import('esmock');
        // This test sends raw frames; message encoding is covered by codec tests.
        const { default: ConsensusV1Protocol } = await esmock.strict(
            '../../../src/core/consensus/protocols/ConsensusV1Protocol.js',
            { '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js': { encodeConsensusMessage: message => message } }
        );

        let remote;
        const local = new Duplex({
            objectMode: true,
            read() {},
            write(data, _encoding, callback) { remote.push(data); callback(); },
            final(callback) { remote.push(null); callback(); }
        });
        remote = new Duplex({
            objectMode: true,
            read() {},
            write(data, _encoding, callback) { local.push(data); callback(); },
            final(callback) { local.push(null); callback(); }
        });
        local.userData = null;
        remote.userData = null;
        local.remotePublicKey = b4a.alloc(32, 1);
        t.teardown(() => { local.destroy(); remote.destroy(); });

        const originalConsoleError = console.error;
        let reportError;
        const routerFailed = new Promise(resolve => { reportError = resolve; });
        console.error = message => reportError(message);
        t.teardown(() => { console.error = originalConsoleError; });

        let receiveNextMessage;
        const nextMessage = new Promise(resolve => { receiveNextMessage = resolve; });
        new ConsensusV1Protocol({
            async route(message) {
                if (b4a.toString(message) === 'invalid') throw new Error('router failed');
                receiveNextMessage(message);
            }
        }, local, { rejectPendingRequestsForSession() {} }, function onClose() {});

        const remoteConsensus = Protomux.from(remote).createChannel({ protocol: 'consensus/v1' });
        const sendConsensus = remoteConsensus.addMessage({ encoding: c.raw });
        remoteConsensus.open();

        let receiveOtherMessage;
        const otherMessage = new Promise(resolve => { receiveOtherMessage = resolve; });
        const remoteOther = Protomux.from(remote).createChannel({ protocol: 'shared-transport-test' });
        remoteOther.addMessage({ encoding: c.raw, onmessage: receiveOtherMessage });
        remoteOther.open();
        const localOther = Protomux.from(local).createChannel({ protocol: 'shared-transport-test' });
        const sendOther = localOther.addMessage({ encoding: c.raw });
        localOther.open();

        sendConsensus.send(b4a.from('invalid'));
        t.ok((await routerFailed).includes('router failed'));
        t.absent(local.writableEnded, 'router failure does not end the transport');
        t.absent(local.destroyed, 'router failure does not destroy the transport');
        if (local.writableEnded || local.destroyed) return;

        sendOther.send(b4a.from('other-channel-data'));
        t.is(b4a.toString(await otherMessage), 'other-channel-data', 'another channel can still send data');

        sendConsensus.send(b4a.from('next-consensus-message'));
        t.is(b4a.toString(await nextMessage), 'next-consensus-message', 'consensus can still receive messages');
    });
}
