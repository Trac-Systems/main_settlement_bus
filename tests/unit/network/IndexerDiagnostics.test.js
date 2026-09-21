import test from 'brittle';
import EventEmitter from 'bare-events';
import Autobase from 'autobase';
import Timer from 'autobase/lib/timer.js';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import IndexerDiagnostics from '../../../src/diagnostics/IndexerDiagnostics.js';
import { runtimeMetadata } from '../../../src/diagnostics/runtimeMetadata.js';

const key = n => b4a.alloc(32, n);
const last = (logs, event) => logs.filter(log => log.event === `msb.diag.${event}`).at(-1);

function fakeCore(n, length = 10) {
    const core = new EventEmitter();
    const state = { fork: 0 };
    return Object.assign(core, {
        key: key(n), length, signedLength: length, contiguousLength: length, fork: 0,
        opened: true, peers: [], state, core: { state, bitfield: { get: () => false } },
        get() { throw new Error('Diagnostics must not read blocks'); },
        download() { throw new Error('Diagnostics must not request blocks'); },
    });
}

function fakeBase() {
    const base = {
        opened: true, isIndexer: true, _acking: false, _interrupting: false, _appending: null,
        local: fakeCore(1), view: { core: fakeCore(2) },
        localWriter: { closed: false }, activeWriters: new Map(),
        linearizer: { indexers: [], shouldAck: () => false },
        system: { core: fakeCore(3), indexers: [] },
        _applyState: {
            opened: true, closing: false, quorum: 2, checkpoints: [], system: { indexers: [] },
            isLocalPendingIndexer: () => false, isLocalIndexer: () => true,
            shouldWrite: async () => false,
        },
        _bump: async () => {}, isFastForwarding: () => false,
        _updateAckThreshold() {}, _bumpAckTimer() { this._ackTimer?.bump(); },
        ack: Autobase.prototype.ack,
    };
    return base;
}

function setup(base = fakeBase(), options = {}) {
    const logs = [];
    const diag = new IndexerDiagnostics(base, {
        diagnostics_write: line => logs.push(JSON.parse(line)), ...options,
    });
    return { base, diag, logs };
}

test('diagnostics exposes actual ACK/timer rejection without repairing or swallowing it', async t => {
    const base = fakeBase();
    const failure = Object.assign(new Error('injected indexed-info failure'), { secretKey: 'MUST_NOT_LOG' });
    base._applyState.shouldWrite = async () => { throw failure; };
    const timer = new Timer(() => base.ack(true), 10000);
    timer.asapStandalone = async () => {};
    base._ackTimer = timer;
    const originalAck = base.ack;
    const originalExecute = timer._execute;
    const { diag, logs } = setup(base);
    t.teardown(() => { diag.stop(); timer.stop(); });

    timer._executeBackground();
    let rejected;
    try { await timer._executing; } catch (error) { rejected = error; }
    t.is(rejected, failure, 'original rejection reaches the caller');
    t.is(base._acking, true, 'observes, does not fix, the retained ACK flag');
    t.ok(timer._executing, 'observes the retained rejected timer promise');
    t.is(timer._timer, null, 'does not reschedule the timer');
    t.is(last(logs, 'ack.failed').flags.acking, true);
    t.is(last(logs, 'ack_timer.failed').error_message, failure.message);
    await base.ack();
    diag.sample();
    const snapshot = last(logs, 'snapshot');
    t.is(snapshot.operations.ack.failed, 1);
    t.is(snapshot.operations.ack.completed, 1, 'subsequent ACK returns early');
    t.is(snapshot.ack_timer.executing_present, true);
    t.is(snapshot.ack_timer.executing_observation.state, 'rejected', 'tracks the exact retained promise');
    t.is(snapshot.operations.ack.last.entry_skip_reason, 'already_acking');
    t.absent(JSON.stringify(logs).includes('MUST_NOT_LOG'), 'does not serialize error properties');
    diag.stop();
    t.is(base.ack, originalAck);
    t.is(timer._execute, originalExecute);
});

test('independent sampler remains usable during an unresolved ACK', async t => {
    const base = fakeBase();
    let resolve;
    base._applyState.shouldWrite = () => new Promise(done => { resolve = done; });
    let now = 1000;
    const { diag, logs } = setup(base, { diagnostics_now: () => now });
    const pending = base.ack();
    await Promise.resolve();
    now += 70000;
    diag.sample();
    const snapshot = last(logs, 'snapshot');
    t.is(snapshot.flags.acking, true);
    t.is(snapshot.operations.ack.active[0].age_ms, 70000);
    t.is(snapshot.operations.should_write.active.length, 1);
    t.is(snapshot.operations.ack.failed, 0, 'pending is not reported as rejected');
    resolve(false);
    await pending;
    t.is(base._acking, false);
    diag.stop();
});

test('logger failures preserve synchronous values, async values and thrown errors', async t => {
    const { diag } = setup(undefined, { diagnostics_write() { throw new Error('broken sink'); } });
    const receiver = { expected: 42 };
    t.is(diag.trace('apply', function (n) { return this.expected + n; }, receiver, [1]), 43);
    t.is(await diag.trace('apply', async function () { return this.expected; }, receiver, []), 42);
    const failure = new Error('original');
    let actual;
    try { diag.trace('apply', () => { throw failure; }, receiver, []); } catch (e) { actual = e; }
    t.is(actual, failure);
    actual = null;
    try { await diag.trace('apply', async () => { throw failure; }, receiver, []); } catch (e) { actual = e; }
    t.is(actual, failure);
    diag.sample();
    diag.stop();
    t.pass('sink cannot interrupt sampling or cleanup');
});

test('stall needs an observed unsigned gap; view changes reset progress history', t => {
    let now = 1000;
    const { base, diag, logs } = setup(undefined, { diagnostics_now: () => now });
    diag.sample();
    now += 600000;
    diag.sample();
    t.is(last(logs, 'snapshot').stalled, false, 'idle without work is healthy');
    base.view.core.length++;
    diag.sample();
    t.is(last(logs, 'snapshot').stalled, false, 'new work does not inherit old idle time');
    now += 60000;
    diag.sample();
    t.is(last(logs, 'snapshot').stalled, true);
    base.view.core.signedLength++;
    diag.sample();
    t.is(last(logs, 'progress.resumed').reason, 'signed_progress');
    base.view.core.key = key(9);
    diag.sample();
    t.is(last(logs, 'snapshot').last_signed_progress_at_ms, null);
    diag.stop();
});

test('writer snapshot distinguishes known length, missing blocks and ordinary-writer dependencies', t => {
    const { base, diag, logs } = setup();
    const core = fakeCore(7, 25);
    core.contiguousLength = 12;
    const writer = {
        core, length: 12, available: 12, indexed: 10, seenLength: 25,
        nodes: { length: 12 }, isActiveIndexer: true,
        node: { heads: [{ key: key(8), length: 30 }], dependencies: new Set() },
    };
    const dep = { core: fakeCore(8, 20), length: 15, available: 15, nodes: { length: 15 }, frozen: false };
    const map = new Map([[hexKey(7), writer], [hexKey(8), dep]]);
    base.activeWriters = { [Symbol.iterator]: () => map.values(), get: k => map.get(b4a.toString(k, 'hex')) };
    diag.sample();
    core.emit('download', 12, 50, { remotePublicKey: key(4) });
    diag.sample();
    const result = last(logs, 'snapshot').writers.find(w => w.core.key === hexKey(7));
    t.is(result.core.length, 25);
    t.is(result.has_next_block, false);
    t.is(result.processed_length, 12);
    t.is(result.pending_dependencies[0].required_length, 30);
    t.is(result.pending_dependencies[0].known_length, 20);
    t.is(result.io.last_download_index, 12);
    t.is(last(logs, 'snapshot').writers.length, 2, 'includes blocked ordinary writer');
    diag.stop();
    t.is(core.listenerCount('download'), 0);
});

const hexKey = n => b4a.toString(key(n), 'hex');

test('socket identities survive replacement and early errors retain EventEmitter semantics', t => {
    const { diag, logs } = setup();
    const a = Object.assign(new EventEmitter(), { remotePublicKey: key(9) });
    const b = Object.assign(new EventEmitter(), { remotePublicKey: key(9) });
    // A throwing emitter verifies the wrapper cannot turn an unhandled error into
    // a handled event; bare-events itself reports unhandled errors asynchronously.
    a.emit = b.emit = function (event, ...args) {
        if (event === 'error') throw args[0];
        return EventEmitter.prototype.emit.call(this, event, ...args);
    };
    const original = a.emit;
    diag.trackConnection(a, {});
    diag.trackConnection(b, {});
    const ids = logs.filter(l => l.event === 'msb.diag.connection.opened').map(l => l.connection_id);
    t.not(ids[0], ids[1]);
    const failure = new Error('early socket error');
    let actual;
    try { a.emit('error', failure); } catch (error) { actual = error; }
    t.is(actual, failure, 'diagnostics does not add a swallowing error listener');
    t.is(last(logs, 'connection.error').connection_id, ids[0]);
    a.emit('close');
    t.is(a.emit, original);
    t.is(diag.connections.size, 1, 'new socket remains tracked');
    diag.connectionStage(b, 'replicating');
    t.is(last(logs, 'connection.stage').connection_id, ids[1]);
    diag.stop();
    t.is(b.emit, original);
});

test('peer diagnostics preserve leave/join effects and expose retained non-explicit peers', t => {
    const { diag, logs } = setup();
    const peer = { publicKey: key(4), explicit: true };
    let joins = 0;
    const swarm = {
        keyPair: { publicKey: key(1), secretKey: 'MUST_NOT_LOG' },
        peers: new Map([[hexKey(4), peer]]),
        leavePeer(k) { this.peers.get(b4a.toString(k, 'hex')).explicit = false; return 17; },
        joinPeer() { joins++; return 23; },
    };
    const original = swarm.leavePeer;
    diag.attachNetwork(swarm);
    t.is(swarm.leavePeer(key(4)), 17);
    diag.connectRequested(hexKey(4), 'validator');
    t.is(last(logs, 'peer.connect_requested').peer_state.explicit, false);
    t.is(joins, 0, 'diagnostics never reconnects');
    t.is(swarm.joinPeer(key(4)), 23);
    t.is(joins, 1);
    t.absent(JSON.stringify(logs).includes('MUST_NOT_LOG'));
    diag.stop();
    t.is(swarm.leavePeer, original);
});

test('rate limit reports dropped events and does not suppress snapshots', t => {
    const { diag, logs } = setup();
    for (let i = 0; i < 1000; i++) diag.emit('peer.connect_requested', { peer: hexKey(4) });
    diag.sample();
    const count = logs.filter(l => l.event === 'msb.diag.peer.connect_requested').length;
    t.ok(count > 0 && count <= 120);
    t.is(last(logs, 'snapshot').suppressed_events['peer.connect_requested'], 1000 - count);
    diag.stop();
});

test('outgoing handshake failure is logged before a successful swarm connection event', t => {
    const { diag, logs } = setup();
    const peer = { publicKey: key(6) };
    const socket = Object.assign(new EventEmitter(), { remotePublicKey: key(6) });
    let seenError;
    socket.on('error', error => { seenError = error; });
    const swarm = {
        peers: new Map([[hexKey(6), peer]]),
        _allConnections: new Map(),
        _connect(p) { this._allConnections.set(p.publicKey, socket); return 19; },
    };
    const original = swarm._connect;
    diag.attachNetwork(swarm);
    t.is(swarm._connect(peer), 19);
    const attempted = last(logs, 'connection.attempted');
    t.is(attempted.stage, 'connecting');
    t.is(attempted.opened_at_ms, null);
    const failure = Object.assign(new Error('handshake timeout'), { code: 'ETIMEDOUT' });
    socket.emit('error', failure);
    t.is(seenError, failure, 'existing transport error handler still runs');
    t.is(last(logs, 'connection.error').connection_id, attempted.connection_id);
    t.is(last(logs, 'connection.error').error_code, 'ETIMEDOUT');
    socket.emit('close');
    t.is(diag.connections.size, 0);
    diag.stop();
    t.is(swarm._connect, original);
});

test('replacement ACK timers are instrumented and originals restored on shutdown', t => {
    const { base, diag } = setup();
    const a = new Timer(async () => {}, 10000);
    const b = new Timer(async () => {}, 10000);
    const original = a._execute;
    base._ackTimer = a;
    diag.sample();
    t.not(a._execute, original);
    base._ackTimer = b;
    diag.sample();
    t.is(a._execute, original);
    t.not(b._execute, original);
    diag.stop();
    t.is(b._execute, original);
});

test('successful ACKs are summarized by default and failures remain immediate', async t => {
    const { base, diag, logs } = setup();
    for (let i = 0; i < 100; i++) await base.ack();
    t.is(logs.length, 0, 'no per-cycle successful ACK output');
    diag.sample();
    t.is(last(logs, 'snapshot').operations.ack.completed, 100);
    base._applyState.shouldWrite = async () => { throw new Error('unexpected ack failure'); };
    // Refresh after replacing the method to emulate a fresh apply-state instance.
    base._applyState = { ...base._applyState };
    try { await base.ack(); } catch {}
    t.ok(last(logs, 'ack.failed'));
    diag.stop();
});

test('peer details are periodic and collected immediately on entering a stall', t => {
    let now = 1000;
    const { base, diag, logs } = setup(undefined, { diagnostics_now: () => now });
    diag.sample();
    t.is(last(logs, 'snapshot').details_included, true);
    now += 10000;
    diag.sample();
    t.is(last(logs, 'snapshot').details_included, false);
    now += 50000;
    diag.sample();
    t.is(last(logs, 'snapshot').details_included, true);
    base.view.core.length++;
    diag.sample();
    now += 50000;
    diag.sample(true);
    now += 10000;
    diag.sample();
    t.is(last(logs, 'snapshot').stalled, true);
    t.is(last(logs, 'snapshot').details_included, true);
    diag.stop();
});

test('large snapshot retains ACK/progress evidence within a 32 KiB line', t => {
    const { base, diag, logs } = setup();
    const writers = Array.from({ length: 32 }, (_, i) => {
        const core = fakeCore(i + 1, 100);
        core.peers = Array.from({ length: 16 }, (_, j) => ({
            remotePublicKey: key(j + 1), remoteLength: 100, remoteFork: 0,
            remoteOpened: true, remoteSynced: true, inflight: 0, dataProcessing: 0, paused: false,
            remoteBitfield: { get: () => true }, stats: { wireRequest: { tx: 100 }, wireData: { rx: 100 } },
        }));
        return { core, length: 99, available: 99, nodes: { length: 99 }, isActiveIndexer: i < 3 };
    });
    base.activeWriters = writers;
    base.localWriter = writers[0];
    diag.sample();
    const snapshot = last(logs, 'snapshot');
    t.ok(b4a.byteLength(JSON.stringify(snapshot)) + 1 <= 32 * 1024);
    t.is(snapshot.size_limited, true);
    t.is(snapshot.view.signed_length, base.view.core.signedLength);
    t.is(snapshot.flags.acking, false);
    t.ok(snapshot.writers.filter(w => w.active_indexer).length === 3);
    t.ok(snapshot.writers[0].peers.length > 0, 'indexer replication details have priority');
    diag.stop();
});

test('error output has an independent byte budget after ordinary event saturation', t => {
    const { diag, logs } = setup();
    for (let i = 0; i < 1000; i++) diag.emit('connection.opened', { peer: hexKey(4) });
    for (let i = 0; i < 1000; i++) diag.failure('ack.failed', new Error('fixture failure'));
    const ordinaryBytes = logs.filter(l => l.event === 'msb.diag.connection.opened').reduce((n, l) => n + b4a.byteLength(JSON.stringify(l)) + 1, 0);
    const errorBytes = logs.filter(l => l.event === 'msb.diag.ack.failed').reduce((n, l) => n + b4a.byteLength(JSON.stringify(l)) + 1, 0);
    t.ok(ordinaryBytes <= 8 * 1024);
    t.ok(errorBytes > 0 && errorBytes <= 16 * 1024);
    diag.sample();
    t.ok(last(logs, 'snapshot'));
    diag.stop();
});

test('startup metadata identifies installed libraries and source fingerprints', t => {
    const metadata = runtimeMetadata();
    t.is(metadata.dependencies?.autobase, '7.20.1');
    t.is(metadata.dependencies?.hyperswarm, '4.14.2');
    t.ok(/^[a-f0-9]{64}$/.test(metadata.source_blake2b256?.['src/diagnostics/IndexerDiagnostics.js']));
});

test('real isolated Autobase finalizes and exposes live writer/checkpoint data with diagnostics', async t => {
    const store = new Corestore(await t.tmp());
    const logs = [];
    const base = new Autobase(store, null, {
        ackInterval: 20, valueEncoding: 'json',
        open: store => new Hyperbee(store.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json' }),
        apply: async (nodes, view) => { for (const node of nodes) if (node.value) await view.put('test', node.value); },
    });
    const diag = new IndexerDiagnostics(base, { diagnostics_write: line => logs.push(JSON.parse(line)) });
    t.teardown(async () => { diag.stop(); await base.close(); await store.close(); });
    await base.ready();
    const nativeView = base.view.core;
    diag.start();
    await base.append({ value: 'diagnostic smoke test' });
    for (let i = 0; nativeView.signedLength < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20));
    diag.sample();
    t.is(nativeView.signedLength, nativeView.length);
    t.ok(nativeView.signedLength >= 2);
    t.is(logs.filter(l => l.event === 'msb.diag.snapshot.failed').length, 0);
    const snapshot = last(logs, 'snapshot');
    t.is(snapshot.view.signed_length, nativeView.length);
    t.ok(snapshot.writers.some(w => w.local));
    t.ok(snapshot.checkpoints.length > 0);
});

test('three instrumented indexers exchange checkpoints and two continue after a clean disconnection', async t => {
    const stores = [];
    const bases = [];
    const diagnostics = [];
    const logs = [[], [], []];
    const links = [];
    const opts = {
        ackInterval: 20, valueEncoding: 'json', fastForward: false,
        open: store => new Hyperbee(store.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json' }),
        apply: async (nodes, view, base) => {
            for (const { value } of nodes) {
                if (value?.add) await base.addWriter(b4a.from(value.add, 'hex'), { indexer: true });
                else if (value?.key) await view.put(value.key, value.data);
            }
        },
    };
    t.teardown(async () => {
        for (const diag of diagnostics) diag.stop();
        for (const { a, b } of links) { a.destroy(); b.destroy(); }
        await Promise.all(bases.map(b => b.close()));
        await Promise.all(stores.map(s => s.close()));
    });
    for (let i = 0; i < 3; i++) {
        const store = new Corestore(await t.tmp());
        stores.push(store);
        const base = new Autobase(store, bases[0]?.local.key ?? null, opts);
        bases.push(base);
        const diag = new IndexerDiagnostics(base, { diagnostics_write: line => logs[i].push(JSON.parse(line)) });
        diagnostics.push(diag);
        await base.ready();
        diag.start();
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const a = stores[i].replicate(true);
        const b = stores[j].replicate(false);
        a.pipe(b).pipe(a);
        links.push({ i, j, a, b });
    }
    const waitUntil = async predicate => {
        for (let i = 0; i < 500; i++) {
            if (predicate()) return;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error('Isolated indexer network did not converge');
    };
    for (let i = 1; i < 3; i++) {
        await bases[0].append({ add: b4a.toString(bases[i].local.key, 'hex') });
        await waitUntil(() => bases.every(b => b.system?.indexers.length === i + 1));
    }
    await bases[0].append({ key: 'first', data: 1 });
    await waitUntil(() => bases.every(b => b.view.core.length >= 2 && b.view.core.signedLength === b.view.core.length));
    for (const diag of diagnostics) diag.sample(true);
    for (let i = 0; i < 3; i++) {
        const snapshot = last(logs[i], 'snapshot');
        t.is(snapshot.quorum, 2);
        t.is(snapshot.checkpoints.length, 3);
        t.ok(snapshot.writers.some(w => w.peers.length > 0), 'records actual replication peers');
        t.is(logs[i].filter(l => l.event === 'msb.diag.snapshot.failed').length, 0);
    }
    const before = bases[0].view.core.signedLength;
    for (const link of links.filter(link => link.j === 2)) { link.a.destroy(); link.b.destroy(); }
    await bases[0].append({ key: 'after-disconnection', data: 2 });
    await waitUntil(() => bases.slice(0, 2).every(b => b.view.core.signedLength > before));
    t.ok(bases[0].view.core.signedLength > before, 'remaining quorum finalizes with diagnostics enabled');
});
