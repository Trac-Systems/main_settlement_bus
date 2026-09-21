import test from 'brittle';
import b4a from 'b4a';
import DiagnosticOutput, { RotatingDiagnosticLog } from '../../../src/diagnostics/DiagnosticOutput.js';
import IndexerDiagnostics from '../../../src/diagnostics/IndexerDiagnostics.js';
import Autobase from 'autobase';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee';

const fs = (await (typeof Bare !== 'undefined' ? import('bare-fs') : import('fs'))).default;
const call = (method, ...args) => new Promise((resolve, reject) => {
    fs[method](...args, (error, value) => error ? reject(error) : resolve(value))?.catch?.(reject);
});

test('file output appends across starts and rotates complete JSON lines with bounded retention', async t => {
    const filename = `${await t.tmp()}/logs/diag.jsonl`;
    const row = i => JSON.stringify({ i, text: 'ą'.repeat(30) });
    const bytes = b4a.byteLength(row(0)) + 1;
    const options = { maxBytes: bytes * 2, archives: 2 };
    let sink = new RotatingDiagnosticLog(filename, options);
    for (let i = 0; i < 4; i++) { sink.write(row(i)); await sink.flush(); }
    await sink.close();
    sink = new RotatingDiagnosticLog(filename, options);
    for (let i = 4; i < 8; i++) { sink.write(row(i)); await sink.flush(); }
    await sink.close();
    const all = [];
    for (const suffix of ['.2', '.1', '']) {
        const text = await call('readFile', filename + suffix, 'utf8');
        t.ok(b4a.byteLength(text) <= bytes * 2, 'file byte limit includes UTF-8 and newlines');
        all.push(...text.trim().split('\n').map(line => JSON.parse(line).i));
    }
    t.alike(all, [2, 3, 4, 5, 6, 7], 'oldest records expire; append order survives rotation and reopening');
    t.is((await call('readdir', `${filename.slice(0, filename.lastIndexOf('/'))}`)).length, 3);
    t.is(sink.status().failed, false);
});

test('slow file writes bound queued bytes including in-flight data and never await producers', async t => {
    let release;
    let entered;
    const writing = new Promise(resolve => { entered = resolve; });
    const sink = new RotatingDiagnosticLog('/unused/diag.jsonl', {
        maxQueueBytes: 64,
        fs: {
            mkdir(path, opts, cb) { cb(null); },
            stat(path, cb) { cb(Object.assign(new Error(), { code: 'ENOENT' })); },
            appendFile(path, text, opts, cb) {
                if (!release) { release = cb; entered(); }
                else cb(null);
            },
        },
    });
    t.is(sink.write('x'.repeat(31)), true);
    const pending = sink.flush();
    await writing;
    t.is(sink.write('y'.repeat(31)), true);
    t.is(sink.write('overflow'), false);
    t.is(sink.status().queued_bytes, 64);
    t.is(sink.status().dropped_lines, 1);
    release(null);
    await pending;
    t.is(sink.status().queued_bytes, 0);
    t.is(sink.status().written_bytes, 64);
    await sink.close();
});

test('disk failure disables file output once, reports lost records, and resolves cleanup', async t => {
    let errors = 0;
    const sink = new RotatingDiagnosticLog('/unused/diag.jsonl', {
        onError() { errors++; throw new Error('broken warning sink'); },
        fs: {
            mkdir(path, opts, cb) { cb(null); },
            stat(path, cb) { cb(null, { size: 0 }); },
            appendFile(path, text, opts, cb) { cb(Object.assign(new Error('disk full'), { code: 'ENOSPC' })); },
        },
    });
    sink.write('first');
    sink.write('second');
    await sink.flush();
    t.is(sink.status().failed, true);
    t.is(sink.status().queued_bytes, 0);
    t.is(sink.status().dropped_lines, 2);
    t.is(sink.write('third'), false);
    t.is(sink.status().dropped_lines, 3);
    t.is(errors, 1, 'does not flood stdout or retry writes');
    await sink.close();
});

test('console summarizes finalization every 30 seconds, with immediate bounded ACK alerts', async t => {
    const filename = `${await t.tmp()}/diag.jsonl`;
    const consoleLines = [];
    let now = 1000000;
    const out = new DiagnosticOutput(filename, {
        diagnostics_now: () => now, diagnostics_console_write: line => consoleLines.push(line),
    });
    const send = (event, fields) => {
        const p = { event: `msb.diag.${event}`, epoch_ms: now, timestamp: new Date(now).toISOString(), ...fields };
        out.write(JSON.stringify(p), p);
    };
    const snapshot = signed => ({ view: { key: 'view', fork: 0, length: signed, signed_length: signed },
        flags: { acking: false }, operations: { ack: { failed: 0, active: [], active_count: 0 } },
        ack_timer: { executing_present: false }, network: { connected: 64 }, stalled: false });
    send('snapshot', snapshot(100));
    for (let i = 0; i < 100; i++) send('connection.error', { error_code: 'PEER_NOT_FOUND' });
    now += 10000;
    send('snapshot', snapshot(101));
    now += 20000;
    send('snapshot', snapshot(103));
    t.is(consoleLines.length, 2, 'connection errors and full snapshots stay out of the console');
    t.ok(consoleLines[1].includes('state=finalizing signed=103 unsigned=103 gap=0 signed_delta=+3/30s'));
    for (let i = 0; i < 20; i++) send('ack.failed', { error_message: 'test\nerror' });
    t.is(consoleLines.filter(l => l.includes('ack.failed')).length, 6);
    t.ok(consoleLines.every(l => !l.includes('\n')), 'alerts cannot expand into multiple lines');
    await out.close();
    const saved = (await call('readFile', filename, 'utf8')).trim().split('\n').map(JSON.parse);
    t.is(saved.filter(p => p.event === 'msb.diag.connection.error').length, 100);
    t.is(saved.filter(p => p.event === 'msb.diag.ack.failed').length, 20, 'console throttling does not drop file records');
});

test('diagnostic file integration keeps ACK errors and signed progress without JSON console output', async t => {
    const filename = `${await t.tmp()}/diag.jsonl`;
    const consoleLines = [];
    const base = { isIndexer: true, _acking: false, view: { core: { key: b4a.alloc(32, 1),
        fork: 0, length: 10, signedLength: 10 } }, activeWriters: [] };
    const diag = new IndexerDiagnostics(base, {
        diagnostics_log_file: filename, diagnostics_console_write: line => consoleLines.push(line),
    });
    diag.start();
    const original = new Error('original apply rejection');
    let observed;
    try { await diag.trace('apply', async () => { throw original; }, null, []); } catch (error) { observed = error; }
    t.is(observed, original);
    await diag.stop();
    const records = (await call('readFile', filename, 'utf8')).trim().split('\n').map(JSON.parse);
    t.ok(records.some(p => p.event === 'msb.diag.started' && p.output === 'rotating_file'));
    t.ok(records.some(p => p.event === 'msb.diag.snapshot' && p.view.signed_length === 10));
    t.ok(records.some(p => p.event === 'msb.diag.apply.failed'));
    t.ok(records.some(p => p.event === 'msb.diag.stopped'));
    t.ok(consoleLines.every(l => l.startsWith('[MSB]')), 'console contains only short presentation lines');
});

test('real Autobase finalizes while diagnostic disk writes remain blocked and its queue overflows', async t => {
    const store = new Corestore(await t.tmp());
    const base = new Autobase(store, null, {
        ackInterval: 20, valueEncoding: 'json',
        open: store => new Hyperbee(store.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json' }),
        apply: async (nodes, view) => {
            for (const { value } of nodes) if (value) await view.put(value.key, value.data);
        },
    });
    const diag = new IndexerDiagnostics(base, {
        diagnostics_log_file: '/unused/diag.jsonl', diagnostics_console_write: () => {},
    });
    let release;
    let entered;
    const writing = new Promise(resolve => { entered = resolve; });
    // Only diagnostic I/O is held; the isolated database uses its real disk path.
    diag.output.file.fs = {
        mkdir(path, opts, cb) { cb(null); },
        stat(path, cb) { cb(null, { size: 0 }); },
        appendFile(path, text, opts, cb) {
            if (!release) { release = cb; entered(); }
            else cb(null);
        },
    };
    t.teardown(async () => {
        release?.(null);
        await diag.stop();
        await base.close();
        await store.close();
    });
    await base.ready();
    diag.start();
    const diskWrite = diag.output.file.flush();
    await writing;
    for (let i = 0; i < 40; i++) diag.output.file.write('x'.repeat(32 * 1024));
    t.ok(diag.output.status().dropped_lines > 0, 'saturated diagnostic queue discards excess records');
    t.ok(diag.output.status().queued_bytes <= 1024 * 1024, 'in-flight batch counts toward queue limit');
    const before = base.view.core.signedLength;
    await base.append({ key: 'test', data: 'finalized despite blocked logging' });
    for (let i = 0; i < 200; i++) {
        if (base.view.core.signedLength > before && base.view.core.signedLength === base.view.core.length) break;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    t.ok(base.view.core.signedLength > before, 'signed progress does not await the logging queue');
    t.is(base.view.core.signedLength, base.view.core.length);
    t.is((await base.view.get('test')).value, 'finalized despite blocked logging');
    t.is(diag.output.status().written_bytes, 0, 'diagnostic write is still blocked at finalization');
    release(null);
    await diskWrite;
    release = () => {};
});
