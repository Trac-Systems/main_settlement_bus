import http from 'http';
import b4a from 'b4a';
import { createGraylogConfig } from '../config/graylog.js';

const instances = new WeakMap();
const sensitive = /token|password|secret|mnemonic|seed|private.?key|authorization|cookie|payload|request.?body|response.?body/i;
const reserved = new Set(['app', 'env', 'host', 'event', 'version', 'short_message', 'full_message', 'timestamp', 'level', 'id']);
const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : 'TRANSPORT_ERROR';

export class Telemetry {
    constructor(settings = {}) {
        this.settings = createGraylogConfig(settings, {});
        this.enabled = this.settings.enabled;
        this.context = { git_sha: this.redact(this.settings.release) };
        this.listeners = new Set();
        this.queue = [];
        this.active = new Set();
        this.waiters = new Set();
        this.closed = false;
        this.closing = null;
        this.pumpScheduled = false;
        this.lastWarningAt = -Infinity;
        this.counters = { emitted: 0, sent: 0, failed: 0, dropped: 0, timeouts: 0, lastSuccessAt: null, lastFailureAt: null, lastError: null };
    }

    redact(value) {
        // Keep enough look-ahead to redact a secret that crosses the field truncation boundary.
        const secrets = [this.settings.token, this.settings.url].filter(Boolean);
        const lookAhead = Math.max(0, ...secrets.map(secret => secret.length));
        let result = value.slice(0, 2048 + lookAhead);
        for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
        return result.slice(0, 2048);
    }

    normalize(value, seen = new WeakSet(), depth = 0) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return this.redact(value);
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value !== 'object') return '[Unsupported]';
        if (depth >= 4) return '[Truncated]';
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
        // Arbitrary error messages/stacks can contain payloads, credentials or collector URLs.
        if (value instanceof Error) return { name: this.redact(value.name), code: safeCode(value.code) };
        const result = Array.isArray(value) ? [] : Object.create(null);
        for (const key of Object.keys(value).slice(0, 32)) {
            if (sensitive.test(key)) {
                result[key] = '[REDACTED]';
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            result[key] = descriptor && 'value' in descriptor ? this.normalize(descriptor.value, seen, depth + 1) : '[Unreadable]';
        }
        return result;
    }

    fields(input) {
        const output = Object.create(null);
        if (!input || typeof input !== 'object') return output;
        for (const key of Object.keys(input).slice(0, 64)) {
            const name = key.replace(/^_+/, '');
            if (!/^[\w.-]{1,64}$/.test(name) || reserved.has(name) || sensitive.test(name)) continue;
            const descriptor = Object.getOwnPropertyDescriptor(input, key);
            if (!descriptor || !('value' in descriptor)) continue;
            const normalized = this.normalize(descriptor.value);
            if (normalized === null) continue;
            output[name] = typeof normalized === 'object' ? this.redact(JSON.stringify(normalized)) : normalized;
        }
        return output;
    }

    setContext(fields) {
        try { Object.assign(this.context, this.fields(fields)); } catch { /* Logging never interrupts the caller. */ }
    }

    onEvent(listener) {
        if (typeof listener !== 'function' || this.closed) return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    emit(event, fields = {}, level = 6) {
        if (!this.enabled || this.closed) return;
        try {
            if (typeof event !== 'string' || !event.trim()) return;
            event = this.redact(event.trim()).slice(0, 160);
            const timestamp = Date.now() / 1000;
            level = Number.isInteger(level) && level >= 0 && level <= 7 ? level : 6;
            const safeFields = Object.freeze({ ...this.fields(fields), ...this.context });
            this.counters.emitted++;
            for (const listener of this.listeners) {
                try { listener({ event, fields: safeFields, level, timestamp }); } catch { /* Isolate observers. */ }
            }
            if (this.queue.length >= this.settings.maxQueueSize) {
                this.counters.dropped++;
                this.warn('QUEUE_FULL');
                return;
            }
            const message = {
                version: '1.1', host: this.redact(this.settings.host), short_message: event,
                timestamp, level, _app: this.redact(this.settings.app),
                _env: this.redact(this.settings.environment), _event: event,
            };
            for (const [key, value] of Object.entries(safeFields)) message[`_${key}`] = value;
            const body = JSON.stringify(message);
            if (b4a.byteLength(body) > this.settings.maxMessageBytes) {
                this.counters.dropped++;
                this.warn('MESSAGE_TOO_LARGE');
                return;
            }
            this.queue.push(body);
            this.schedulePump();
        } catch {
            this.counters.dropped++;
            this.warn('SERIALIZATION_ERROR');
        }
    }

    warn(code) {
        const now = Date.now();
        if (now - this.lastWarningAt < 60000) return;
        this.lastWarningAt = now;
        try { console.warn(`[graylog] ${code}; sent=${this.counters.sent} failed=${this.counters.failed} dropped=${this.counters.dropped}`); } catch { /* Isolate local logging too. */ }
    }

    schedulePump() {
        if (this.pumpScheduled) return;
        this.pumpScheduled = true;
        void Promise.resolve().then(() => {
            this.pumpScheduled = false;
            while (this.queue.length && this.active.size < this.settings.concurrency) this.send(this.queue.shift());
        }).catch(() => this.warn('TRANSPORT_ERROR'));
    }

    send(body) {
        let request;
        let completed = false;
        let timer;
        const task = { cancel: null };
        this.active.add(task);
        const finish = (error = null) => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            this.active.delete(task);
            if (error) {
                this.counters.failed++;
                this.counters.lastFailureAt = Date.now();
                this.counters.lastError = error;
                if (error === 'TIMEOUT') this.counters.timeouts++;
                this.warn(error);
                try { request?.destroy(); } catch { /* Best-effort cancellation. */ }
            } else {
                this.counters.sent++;
                this.counters.lastSuccessAt = Date.now();
            }
            this.schedulePump();
            this.notifyDrained();
        };
        task.cancel = () => finish('CLOSED');
        timer = setTimeout(() => finish('TIMEOUT'), this.settings.timeoutMs);
        timer.unref?.();
        void (async () => {
            const url = new URL(this.settings.url);
            if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return finish('INVALID_URL');
            if (/[\r\n]/.test(this.settings.token)) return finish('INVALID_TOKEN');
            let client = http;
            if (url.protocol === 'https:') {
                // The installed Bare TLS implementation does not verify certificates.
                // Fail explicitly rather than exposing tokens to an unverified collector.
                if (typeof globalThis.Bare !== 'undefined') return finish('HTTPS_REQUIRES_NODE');
                client = (await import('node:https')).default;
            }
            if (completed) return;
            request = client.request(url, {
                method: 'POST', agent: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': b4a.byteLength(body),
                    'Connection': 'close',
                    'X-Graylog-Token': this.settings.token,
                },
            }, response => {
                let ended = false;
                response.on('error', error => finish(safeCode(error?.code)));
                response.on('data', () => {}); // Drain without collecting/logging response bodies.
                response.on('end', () => {
                    ended = true;
                    finish(response.statusCode >= 200 && response.statusCode < 300 ? null : `HTTP_${response.statusCode}`);
                });
                response.on('close', () => { if (!ended) finish('RESPONSE_CLOSED'); });
            });
            request.on('error', error => finish(safeCode(error?.code)));
            request.end(body);
        })().catch(error => finish(error instanceof TypeError ? 'INVALID_URL' : safeCode(error?.code)));
    }

    notifyDrained() {
        if (this.queue.length || this.active.size) return;
        for (const done of this.waiters) done(true);
    }

    stats() {
        return { ...this.counters, queueSize: this.queue.length, inFlight: this.active.size, enabled: this.enabled, closed: this.closed };
    }

    flush(timeoutMs = 1500) {
        if (!this.queue.length && !this.active.size) return Promise.resolve(true);
        const duration = Number.isFinite(timeoutMs) ? Math.max(0, Math.min(timeoutMs, 60000)) : 1500;
        return new Promise(resolve => {
            let timer;
            const done = result => {
                clearTimeout(timer);
                this.waiters.delete(done);
                resolve(result);
            };
            timer = setTimeout(() => done(false), duration);
            this.waiters.add(done);
            this.schedulePump();
        });
    }

    close() {
        if (this.closing) return this.closing;
        this.closed = true;
        this.listeners.clear();
        this.closing = this.flush(1500).then(() => {
            this.counters.dropped += this.queue.length;
            this.queue.length = 0;
            for (const task of [...this.active]) task.cancel();
            this.notifyDrained();
        }).catch(() => {});
        return this.closing;
    }
}

const disabled = new Telemetry({ enabled: false });

export function getTelemetry(config) {
    if (!config || (typeof config !== 'object' && typeof config !== 'function')) return disabled;
    let telemetry = instances.get(config);
    if (!telemetry) {
        // Plain test doubles without a graylog section must remain disabled regardless of the host environment.
        telemetry = new Telemetry(config.graylog || { enabled: false });
        instances.set(config, telemetry);
    }
    return telemetry;
}
