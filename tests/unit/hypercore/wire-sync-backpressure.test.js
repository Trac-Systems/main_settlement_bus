import test from 'brittle'
import b4a from 'b4a'
import c from 'compact-encoding'
import Replicator from 'hypercore/lib/replicator.js'
import caps from 'hypercore/lib/caps.js'
import messages from 'hypercore/lib/messages.js'
import Protomux from 'protomux'
import streamx from 'streamx'

function createPeer(protomux, send) {
    return Object.assign(Object.create(Replicator.Peer.prototype), {
        core: { state: { fork: 0, length: 0 }, header: { manifest: {} }, compat: false },
        channel: { closed: false },
        remoteOpened: true,
        remoteLength: 0,
        remoteFork: 0,
        canUpgrade: true,
        syncsProcessing: 0,
        needsSync: false,
        protomux,
        wireSync: { send },
        stats: { wireSync: { tx: 0 } },
        replicator: { stats: { wireSync: { tx: 0 } }, isDownloading: () => true },
        _handleRequests() {}
    })
}

test('wireSync coalesces updates until the same transport drains', async (t) => {
    let releaseWrite
    let blocked = true
    const received = []
    const transport = new streamx.Duplex({
        highWaterMark: 8,
        write(buffer, callback) {
            const state = { buffer, start: 0, end: buffer.length }
            if (c.uint.decode(state) !== 0) {
                c.uint.decode(state)
                received.push(messages.wire.sync.decode(state))
            }
            if (blocked) releaseWrite = callback
            else callback(null)
        }
    })
    t.teardown(() => transport.destroy())
    const mux = new Protomux(transport)
    const channel = mux.createChannel({
        protocol: 'test/wire-sync-backpressure',
        id: b4a.alloc(0),
        ondrain: (session) => session.userData.ondrain()
    })
    const wire = channel.addMessage({ encoding: messages.wire.sync })
    const peer = createPeer(mux, (state) => wire.send(state))
    channel.userData = peer
    peer.channel = channel
    channel.open()
    await new Promise((resolve) => setImmediate(resolve))
    t.is(mux.drained, false, 'the channel open has filled the writable buffer')
    t.is(typeof releaseWrite, 'function', 'the transport is waiting to complete its write')

    for (let length = 1; length <= 100; length++) {
        peer.core.state.length = length
        peer.signalUpgrade()
    }
    t.is(transport._writableState.queue.length, 0, 'no sync frames queued during the stall')
    t.is(peer.needsSync, true, 'one sync is pending')

    blocked = false
    releaseWrite()
    await new Promise((resolve) => setImmediate(resolve))
    t.alike(received.map(({ length }) => length), [100], 'one update carries the latest length')
    t.is(peer.needsSync, false, 'pending sync cleared')
    t.is(mux.drained, true, 'transport drained')
    t.absent(transport.destroyed, 'transport remains connected')
})

test('wireSync deferred during onsync is sent when canUpgrade is unchanged', async (t) => {
    const sent = []
    const peer = createPeer({ drained: false }, (state) => sent.push(state))
    peer.core.state.length = 10
    peer.canUpgrade = false
    peer._update = () => {}
    peer.replicator._updateFork = () => {}

    let finishUpgrade
    const upgrade = new Promise((resolve) => { finishUpgrade = resolve })
    let upgradeChecks = 0
    peer._canUpgrade = () => {
        upgradeChecks++
        return upgradeChecks === 1 ? upgrade : Promise.resolve(false)
    }

    peer.sendSync()
    const processing = peer.onsync({
        fork: 0, length: 2, remoteLength: 0, canUpgrade: false, uploading: true,
        downloading: true, hasManifest: true
    })
    t.is(peer.syncsProcessing, 1, 'incoming sync is waiting for the upgrade check')
    peer.protomux.drained = true
    peer.ondrain()
    t.is(sent.length, 0, 'drain keeps the sync pending while onsync runs')

    peer.core.state.length = 11
    finishUpgrade(false)
    await processing
    await new Promise((resolve) => setImmediate(resolve))
    t.alike(sent.map(({ length }) => length), [11], 'completion sends the latest length')
    t.is(sent[0]?.canUpgrade, false, 'unchanged upgrade result sent with the sync')
    t.is(peer.needsSync, false, 'pending sync cleared')
})

test('wireSync ignores drain after its channel closes', (t) => {
    const sent = []
    const peer = createPeer({ drained: false }, (state) => sent.push(state))
    peer.sendSync()
    t.is(peer.needsSync, true, 'sync is pending at close')

    peer.channel.closed = true
    peer.protomux.drained = true
    peer.ondrain()
    t.is(sent.length, 0, 'a closed channel sends no sync')
})

test('initial sync precedes the range on a new channel sharing a stalled mux', (t) => {
    const sent = []
    const mux = { drained: false, cork() {}, uncork() {} }
    const peer = createPeer(mux, () => sent.push('sync'))
    peer.remoteOpened = false
    peer.core.key = b4a.alloc(32, 1)
    peer.core.state.length = 1
    peer.core.header.hints = { contiguousLength: 1 }
    peer.core.checkIfIdle = () => {}
    peer.stream = { isInitiator: true, handshakeHash: b4a.alloc(32, 2) }
    peer.replicator._ifAvailable = 1
    peer.replicator._addPeer = () => {}
    peer.broadcastRange = () => sent.push('range')

    peer.onopen({ seeks: true, capability: caps.replicate(false, peer.core.key, peer.stream.handshakeHash) })
    t.alike(sent, ['sync', 'range'], 'initial sync precedes initial range')
    t.is(peer.remoteOpened, true, 'replication channel opened')
})
