import test from 'brittle';
import { MsbDiagnostics } from '../../../src/utils/msbDiagnostics.js';
import Hypercore from 'hypercore';
import Hyperbee from 'hyperbee';

function setup(t, { enabled = true } = {}) {
    let now = 0;
    let signedLength = 10;
    let unsignedLength = 10;
    const events = [];
    const listeners = new Set();
    const signed = new Set();
    const unsigned = new Set();
    const reads = [];
    const telemetry = {
        enabled,
        emit(event, fields = {}) {
            events.push({ event, fields });
            for (const listener of listeners) listener({ event, fields });
        },
        onEvent(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        stats: () => ({ sent: 3, failed: 1, queueSize: 0 }),
    };
    const state = {
        getSignedLength: () => signedLength,
        getUnsignedLength: () => unsignedLength,
        isWritable: () => false,
        isIndexer: () => false,
        getSigned: async (hash, options) => { reads.push({ hash, options }); return signed.has(hash) ? {} : null; },
        get: async hash => unsigned.has(hash) ? {} : null,
    };
    const config = { graylog: { intervalMs: 30, stallTimeoutMs: 60, confirmationTimeoutMs: 100 } };
    const monitor = new MsbDiagnostics(config, { telemetry, now: () => now });
    monitor.start(state, { diagnostics: () => ({ validators_connected: 2, pending_commits: 0 }) }, { schedule: false });
    t.teardown(() => monitor.stop());
    return {
        monitor, state, telemetry, events, listeners, signed, unsigned, reads,
        time: value => { now = value; },
        lengths: (s, u) => { signedLength = s; unsignedLength = u; },
        of: name => events.filter(entry => entry.event === name),
        start: (hash, id = 'broadcast-a') => telemetry.emit('tx.broadcast_started', { tx_hash: hash, broadcast_id: id }),
        finish: (hash, success, id = 'broadcast-a') => telemetry.emit('tx.broadcast_finished', { tx_hash: hash, broadcast_id: id, success }),
    };
}

const HASH = 'ab'.repeat(32);

test('MSB diagnostics: disabled monitoring creates no observers or reads', async t => {
    const f = setup(t, { enabled: false });
    await f.monitor.pollTransactions();
    f.monitor.sample();
    t.is(f.events.length, 0);
    t.is(f.listeners.size, 0);
    t.is(f.reads.length, 0);
});

test('MSB diagnostics: idle windows report zeros without claiming a stall', t => {
    const f = setup(t);
    f.time(1000);
    f.monitor.sample();
    f.time(1030);
    f.monitor.sample();
    t.is(f.of('state.progress_stalled').length, 0);
    const snapshots = f.of('msb.progress');
    t.is(snapshots.length, 2);
    t.is(snapshots[0].fields.broadcasts_started, 0);
    t.is(snapshots[0].fields.rpc_received, 0);
    t.is(snapshots[1].fields.sample_delay_ms, 0);
    t.is(snapshots[1].fields.telemetry_failed, 1);
});

test('MSB diagnostics: unsigned, timeout and late signed observations retain correlation', async t => {
    const f = setup(t);
    f.start(HASH);
    f.finish(HASH, 'true'); // GELF observer fields encode booleans as strings.
    f.time(10);
    f.unsigned.add(HASH);
    f.lengths(10, 11);
    await f.monitor.pollTransactions();
    f.monitor.sample();
    t.is(f.of('tx.unsigned_observed').length, 1);
    t.is(f.of('msb.progress')[0].fields.broadcasts_succeeded, 1);
    t.alike(f.reads[0].options, { wait: false, update: false, extension: false, timeout: 1000 }, 'diagnostics never waits for missing remote blocks');

    f.time(120);
    await f.monitor.pollTransactions();
    f.monitor.sample();
    await f.monitor.pollTransactions();
    f.monitor.sample();
    t.is(f.of('tx.confirmation_timeout').length, 1, 'timeout is a transition, not a log every tick');
    t.is(f.of('state.progress_stalled').length, 1);
    t.is(f.of('tx.confirmation_timeout')[0].fields.waiting_for, 'signed');

    f.time(130);
    f.signed.add(HASH);
    f.lengths(11, 11);
    await f.monitor.pollTransactions();
    f.monitor.sample();
    const observed = f.of('tx.signed_observed')[0];
    t.is(observed.fields.tx_hash, HASH);
    t.is(observed.fields.broadcast_id, 'broadcast-a');
    t.is(observed.fields.late, true);
    t.is(observed.fields.duration_ms, 130);
    t.is(f.of('state.progress_resumed').length, 1);
    t.is(f.of('state.progress_resumed')[0].fields.reason, 'signed_progress');
    t.is(f.of('msb.progress').at(-1).fields.tracked_transactions, 0);
});

test('MSB diagnostics: failed sends are not counted as successful pending work', async t => {
    const f = setup(t);
    f.start(HASH);
    f.finish(HASH, 'false');
    f.monitor.sample();
    f.time(1000);
    await f.monitor.pollTransactions();
    f.monitor.sample();
    t.is(f.of('msb.progress')[0].fields.broadcasts_failed, 1);
    t.is(f.of('msb.progress')[0].fields.broadcasts_succeeded, 0);
    t.is(f.of('state.progress_stalled').length, 0);
    t.is(f.of('tx.observation_expired').length, 1, 'unsuccessful sends still have bounded late-observation retention');
});

test('MSB diagnostics: a view length decrease does not report forward progress', t => {
    const f = setup(t);
    f.start(HASH);
    f.finish(HASH, true);
    f.monitor.sample();
    f.time(70);
    f.monitor.sample();
    t.is(f.of('state.progress_stalled').length, 1);
    f.lengths(9, 9);
    f.time(80);
    f.monitor.sample();
    t.is(f.of('state.length_decreased').length, 1);
    t.is(f.of('state.progress_resumed').length, 0, 'a rollback cannot resolve a stall');
    t.is(f.of('msb.progress').at(-1).fields.last_signed_progress_at_ms, 0);
    t.is(f.of('msb.progress').at(-1).fields.last_unsigned_progress_at_ms, 0);
    f.lengths(10, 10);
    f.time(90);
    f.monitor.sample();
    t.is(f.of('state.progress_resumed')[0].fields.reason, 'signed_progress');
});

test('MSB diagnostics: signed-first observation does not invent an unsigned timestamp', async t => {
    const f = setup(t);
    f.start(HASH);
    f.signed.add(HASH);
    await f.monitor.pollTransactions();
    t.is(f.of('tx.signed_observed').length, 1);
    t.is(f.of('tx.unsigned_observed').length, 0);
});

test('MSB diagnostics: observation options work against an actual Hyperbee checkout', async t => {
    const directory = await t.tmp();
    const bee = new Hyperbee(new Hypercore(directory), { keyEncoding: 'utf-8', valueEncoding: 'utf-8' });
    await bee.ready();
    t.teardown(() => bee.close());
    await bee.put(HASH, 'stored-transaction');
    const f = setup(t);
    f.state.getSigned = async (hash, options) => {
        const snapshot = bee.checkout(bee.version);
        try {
            const entry = await snapshot.get(hash, options);
            return entry?.value ?? null;
        } finally {
            await snapshot.close();
        }
    };
    f.start(HASH);
    await f.monitor.pollTransactions();
    t.is(f.of('tx.signed_observed').length, 1, 'local Hyperbee lookup succeeds with the exact monitor read options');
    t.is(f.of('tx.confirmation_timeout').length, 0);
});

test('MSB diagnostics: unavailable local blocks do not suppress observation deadlines', async t => {
    const f = setup(t);
    f.start(HASH);
    f.state.getSigned = async () => { throw new Error('BLOCK_NOT_AVAILABLE'); };
    f.time(110);
    await f.monitor.pollTransactions();
    t.is(f.of('tx.confirmation_timeout').length, 1);
    t.is(f.of('tx.confirmation_timeout')[0].fields.visibility_unknown, true, 'unavailable data is distinguished from confirmed absence');
    f.time(1010);
    await f.monitor.pollTransactions();
    t.is(f.of('tx.observation_expired').length, 1);
});

test('MSB diagnostics: bounded observation capacity and fair polling preserve active gauge', async t => {
    const f = setup(t);
    for (let index = 0; index < 1001; index++) f.start(index.toString(16).padStart(64, '0'), `broadcast-${index}`);
    f.monitor.sample();
    const snapshot = f.of('msb.progress')[0].fields;
    t.is(snapshot.active_broadcasts, 1001, 'active work is counted even beyond the observation cap');
    t.is(snapshot.tracked_transactions, 1000);
    t.is(snapshot.tracking_dropped_total, 1);
    await f.monitor.pollTransactions();
    t.is(f.reads.length, 50);
    await f.monitor.pollTransactions();
    t.is(f.reads.length, 100);
    t.not(f.reads[0].hash, f.reads[50].hash, 'next tick checks the next batch');
});

test('MSB diagnostics: shutdown suppresses late read results and unsubscribes', async t => {
    const f = setup(t);
    f.start(HASH);
    let resolve;
    f.state.getSigned = () => new Promise(done => { resolve = done; });
    const checking = f.monitor.pollTransactions();
    f.monitor.stop();
    resolve({});
    await checking;
    f.monitor.sample();
    t.is(f.listeners.size, 0);
    t.is(f.of('tx.signed_observed').length, 0);
    t.is(f.of('msb.progress').length, 0);
});
