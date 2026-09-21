import b4a from 'b4a';

const isBare = typeof Bare !== 'undefined';
const fs = (await (isBare ? import('bare-fs') : import('fs'))).default;
const path = (await (isBare ? import('bare-path') : import('path'))).default;
const safe = fn => { try { return fn(); } catch { return undefined; } };
const clean = value => String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 180);
const FLUSH_INTERVAL_MS = 5000;

// One writer per filename. Never await this queue from an ACK/apply/network call.
export class RotatingDiagnosticLog {
    constructor(filename, options = {}) {
        this.filename = path.resolve(filename);
        this.fs = options.fs ?? fs;
        this.maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
        this.archives = options.archives ?? 5;
        this.maxQueueBytes = options.maxQueueBytes ?? 1024 * 1024;
        this.onError = options.onError ?? (() => {});
        this.onReady = options.onReady ?? (() => {});
        this.queue = [];
        this.queuedBytes = 0; // Includes the batch currently being written.
        this.writtenBytes = 0;
        this.droppedLines = 0;
        this.droppedBytes = 0;
        this.fileBytes = null;
        this.failed = false;
        this.closed = false;
        this.timer = null;
        this.running = null;
    }

    call(method, ...args) {
        return new Promise((resolve, reject) => {
            const result = this.fs[method](...args, (error, value) => error ? reject(error) : resolve(value));
            // bare-fs supports callbacks and also returns a promise.
            result?.catch?.(reject);
        });
    }

    write(line) {
        if (this.closed) return false;
        const text = line + '\n';
        const bytes = b4a.byteLength(text);
        if (this.failed || bytes > Math.min(this.maxBytes, 64 * 1024) || this.queuedBytes + bytes > this.maxQueueBytes) {
            this.droppedLines++;
            this.droppedBytes += bytes;
            return false;
        }
        this.queue.push({ text, bytes });
        this.queuedBytes += bytes;
        this.schedule();
        return true;
    }

    schedule() {
        if (!this.closed && !this.running && !this.timer && this.queue.length) {
            this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
            this.timer.unref?.();
        }
    }

    async ignoreMissing(method, ...args) {
        try { return await this.call(method, ...args); } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }

    async rotate() {
        await this.ignoreMissing('unlink', `${this.filename}.${this.archives}`);
        for (let n = this.archives - 1; n >= 1; n--) {
            await this.ignoreMissing('rename', `${this.filename}.${n}`, `${this.filename}.${n + 1}`);
        }
        await this.ignoreMissing('rename', this.filename, `${this.filename}.1`);
        this.fileBytes = 0;
    }

    async drain() {
        let inFlightLines = 0;
        try {
            if (this.fileBytes === null) {
                await this.call('mkdir', path.dirname(this.filename), { recursive: true, mode: 0o700 });
                const stat = await this.ignoreMissing('stat', this.filename);
                this.fileBytes = stat?.size ?? 0;
            }
            while (this.queue.length) {
                let bytes = 0;
                let count = 0;
                const batchLimit = Math.min(64 * 1024, this.maxBytes);
                while (count < this.queue.length && bytes + this.queue[count].bytes <= batchLimit) {
                    bytes += this.queue[count++].bytes;
                }
                if (this.fileBytes + bytes > this.maxBytes) await this.rotate();
                const text = this.queue.splice(0, count).map(row => row.text).join('');
                inFlightLines = count;
                await this.call('appendFile', this.filename, text, { encoding: 'utf8', mode: 0o600 });
                this.fileBytes += bytes;
                this.writtenBytes += bytes;
                this.queuedBytes -= bytes;
                inFlightLines = 0;
                if (!this.ready) { this.ready = true; safe(() => this.onReady(this.filename)); }
            }
        } catch (error) {
            // Do not retry a failing disk indefinitely or dump JSON back to stdout.
            this.failed = true;
            this.droppedLines += this.queue.length + inFlightLines;
            this.droppedBytes += this.queuedBytes;
            this.queue = [];
            this.queuedBytes = 0;
            safe(() => this.onError(error));
        }
    }

    flush() {
        clearTimeout(this.timer);
        this.timer = null;
        if (!this.running && this.queue.length) {
            this.running = this.drain().finally(() => { this.running = null; this.schedule(); });
        }
        return this.running ?? Promise.resolve();
    }

    status() {
        return { file: this.filename, queued_bytes: this.queuedBytes, written_bytes: this.writtenBytes,
            dropped_lines: this.droppedLines, dropped_bytes: this.droppedBytes, failed: this.failed };
    }

    async close() {
        this.closed = true;
        do { await this.flush(); } while (this.queue.length);
    }
}

export default class DiagnosticOutput {
    constructor(filename, options = {}) {
        this.console = options.diagnostics_console_write ?? (line => console.log(line));
        this.now = options.diagnostics_now ?? Date.now;
        this.lastSummary = null;
        this.lastView = null;
        this.alertWindow = null;
        this.alertCount = 0;
        this.alertsSuppressed = 0;
        this.file = new RotatingDiagnosticLog(filename, {
            onReady: file => this.print(`[MSB] diagnostics file=${JSON.stringify(file)} rotation=16MiB x 6 files`),
            onError: error => this.print(`[MSB] diagnostic file unavailable (${clean(error.code ?? error.name)}); details are being dropped; file=${JSON.stringify(filename)}`),
        });
    }

    print(line) { safe(() => this.console(line)); }

    write(line, payload) {
        const accepted = this.file.write(line);
        safe(() => this.present(payload));
        return accepted;
    }

    present(p) {
        if (p.event === 'msb.diag.snapshot') {
            if (this.lastSummary !== null && p.epoch_ms - this.lastSummary < 30000) return;
            const v = p.view;
            const known = Number.isFinite(v?.length) && Number.isFinite(v?.signed_length);
            const sameView = known && this.lastView?.key === v.key && this.lastView?.fork === v.fork;
            const delta = sameView ? v.signed_length - this.lastView.signed_length : null;
            const elapsed = this.lastSummary === null ? null : Math.round((p.epoch_ms - this.lastSummary) / 1000);
            const gap = known ? v.length - v.signed_length : null;
            const state = !known ? 'unknown' : p.stalled ? 'stalled' : delta > 0 ? 'finalizing' : gap > 0 ? 'waiting' : 'caught_up';
            const ack = p.operations?.ack;
            const oldest = Math.max(0, ...(ack?.active ?? []).map(op => op.age_ms ?? 0));
            const ackState = p.flags?.acking ? ack?.active_count > 0 ? `running:${oldest}ms` : 'flag_set' : 'idle';
            const file = this.file.status();
            this.print(`[MSB] ${p.timestamp} state=${state} signed=${v?.signed_length ?? '?'} unsigned=${v?.length ?? '?'} gap=${gap ?? '?'} signed_delta=${delta === null ? '?' : `${delta >= 0 ? '+' : ''}${delta}/${elapsed}s`} ack=${ackState} ack_failed=${ack?.failed ?? 0} timer=${p.ack_timer?.executing_observation?.state ?? (p.ack_timer?.executing_present ? 'unobserved' : 'idle')} apply_failed=${p.operations?.apply?.failed ?? 0} peers=${p.network?.connected ?? '?'} log_dropped=${file.dropped_lines} log_failed=${file.failed} alerts_suppressed=${this.alertsSuppressed}`);
            this.lastSummary = p.epoch_ms;
            this.lastView = v;
            return;
        }
        const event = p.event.slice('msb.diag.'.length);
        const critical = /^(ack|ack_timer|ack_append|should_write|should_ack|advance|apply|snapshot)\.failed$/.test(event) || event === 'autobase.error';
        if (!critical && !event.startsWith('progress.')) return;
        const now = this.now();
        if (this.alertWindow === null || now - this.alertWindow >= 60000) { this.alertWindow = now; this.alertCount = 0; }
        if (this.alertCount++ >= 6) { this.alertsSuppressed++; return; }
        this.print(`[MSB] ${p.timestamp} ${event} ${clean(p.reason ?? p.error_code ?? p.error_type)} ${clean(p.error_message)}`);
    }

    status() { return this.file.status(); }
    close() { return this.file.close(); }
}
