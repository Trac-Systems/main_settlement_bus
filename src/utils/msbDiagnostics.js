import process from 'process';
import { getTelemetry } from './telemetry.js';

const MAX_TRACKED_TRANSACTIONS = 1000;
const MAX_CHECKS_PER_TICK = 50;
const OBSERVATION_READ_OPTIONS = Object.freeze({ wait: false, update: false, extension: false, timeout: 1000 });

// Local observations only: these timestamps do not claim network-wide finality times.
export class MsbDiagnostics {
    #config;
    #telemetry;
    #now;
    #state;
    #network;
    #timers = [];
    #unsubscribe;
    #closed = false;
    #checking = false;
    #tracked = new Map();
    #activeBroadcasts = 0;
    #counts = {};
    #lastSampleAt;
    #lastSigned;
    #lastUnsigned;
    #lastSignedProgressAt;
    #lastUnsignedProgressAt;
    #lastPollAt;
    #demandSince = null;
    #stalled = false;
    #trackingDropped = 0;

    constructor(config, { telemetry = getTelemetry(config), now = Date.now } = {}) {
        this.#config = config;
        this.#telemetry = telemetry;
        this.#now = now;
    }

    start(state, network, { schedule = true } = {}) {
        if (!this.#telemetry.enabled || this.#unsubscribe || this.#closed) return;
        this.#state = state;
        this.#network = network;
        const now = this.#now();
        this.#lastSampleAt = this.#lastSignedProgressAt = this.#lastUnsignedProgressAt = now;
        this.#lastSigned = state.getSignedLength();
        this.#lastUnsigned = state.getUnsignedLength();
        this.#unsubscribe = this.#telemetry.onEvent(event => this.#observe(event));
        this.#telemetry.emit('node.started', {
            component: 'msb',
            package_version: process.env?.npm_package_version || 'unknown',
            release: this.#config.graylog?.release || 'unknown',
            max_validators: this.#config.maxValidators,
            max_retries: this.#config.maxRetries,
            message_threshold: this.#config.messageThreshold,
            response_timeout_ms: this.#config.messageValidatorResponseTimeout,
            request_timeout_ms: this.#config.pendingRequestTimeout,
            commit_timeout_ms: this.#config.txCommitTimeout,
            observer_enabled: this.#config.enableValidatorObserver,
            writable: state.isWritable(),
            indexer: state.isIndexer(),
        });
        if (schedule) {
            this.#timers.push(setInterval(() => this.sample(), this.#interval));
            this.#timers.push(setInterval(() => { void this.pollTransactions(); }, Math.min(1000, this.#interval)));
            for (const timer of this.#timers) timer.unref?.();
        }
    }

    get #interval() {
        return this.#config.graylog?.intervalMs ?? 30000;
    }

    get #confirmationTimeout() {
        return this.#config.graylog?.confirmationTimeoutMs ?? 60000;
    }

    #observe({ event, fields }) {
        if (this.#closed) return;
        const countedEvents = {
            'rpc.tx_received': 'rpc_received',
            'tx.broadcast_started': 'broadcasts_started',
            'tx.send_started': 'send_attempts',
            'tx.send_failed': 'send_failures',
            'tx.retry': 'retries',
            'tx.unsigned_observed': 'unsigned_observations',
            'tx.signed_observed': 'signed_observations',
        };
        const counter = countedEvents[event];
        if (counter) this.#counts[counter] = (this.#counts[counter] ?? 0) + 1;
        if (event === 'tx.unsigned_observed') {
            const tracked = this.#tracked.get(fields.tx_hash);
            if (tracked) tracked.unsigned = true;
        }
        if (event === 'tx.broadcast_started') {
            this.#activeBroadcasts++;
            const hash = fields.tx_hash;
            if (typeof hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hash) || this.#tracked.has(hash)) return;
            if (this.#tracked.size >= MAX_TRACKED_TRANSACTIONS) {
                this.#trackingDropped++;
                return;
            }
            this.#tracked.set(hash, {
                hash, broadcastId: fields.broadcast_id, startedAt: this.#now(),
                unsigned: false, succeeded: false, timedOut: false,
            });
        } else if (event === 'tx.broadcast_finished') {
            this.#activeBroadcasts = Math.max(0, this.#activeBroadcasts - 1);
            const success = fields.success === true || fields.success === 'true';
            const name = success ? 'broadcasts_succeeded' : 'broadcasts_failed';
            this.#counts[name] = (this.#counts[name] ?? 0) + 1;
            const tracked = this.#tracked.get(fields.tx_hash);
            if (tracked && success) tracked.succeeded = true;
        }
    }

    async pollTransactions() {
        if (this.#closed || !this.#unsubscribe || this.#checking) return;
        this.#checking = true;
        try {
            const entries = [...this.#tracked.values()].slice(0, MAX_CHECKS_PER_TICK);
            for (const entry of entries) {
                if (this.#closed) return;
                // Move to the end so a large set of pending transactions cannot starve later entries.
                this.#tracked.delete(entry.hash);
                this.#tracked.set(entry.hash, entry);
                let signed;
                let unsigned;
                let readError;
                try {
                    signed = await this.#state.getSigned(entry.hash, { ...OBSERVATION_READ_OPTIONS });
                    if (!signed && !entry.unsigned && !this.#closed) {
                        unsigned = await this.#state.get(entry.hash, { ...OBSERVATION_READ_OPTIONS });
                    }
                } catch (error) {
                    readError = error;
                }
                if (this.#closed) return;
                const now = this.#now();
                const fields = {
                    component: 'msb', tx_hash: entry.hash, broadcast_id: entry.broadcastId,
                    duration_ms: Math.max(0, now - entry.startedAt), late: entry.timedOut,
                    observation: 'local_poll',
                };
                if (signed) {
                    // A signed observation does not tell us when the unsigned state first appeared.
                    this.#telemetry.emit('tx.signed_observed', fields);
                    this.#tracked.delete(entry.hash);
                    continue;
                }
                if (!entry.unsigned && unsigned) {
                    if (this.#closed) return;
                    entry.unsigned = true;
                    this.#telemetry.emit('tx.unsigned_observed', {
                        ...fields, duration_ms: Math.max(0, this.#now() - entry.startedAt),
                    });
                }
                const elapsed = this.#now() - entry.startedAt;
                if (!entry.timedOut && elapsed >= this.#confirmationTimeout) {
                    entry.timedOut = true;
                    this.#telemetry.emit('tx.confirmation_timeout', {
                        ...fields, duration_ms: elapsed, waiting_for: entry.unsigned ? 'signed' : 'unsigned_or_signed',
                        timeout_ms: this.#confirmationTimeout,
                        visibility_unknown: !!readError,
                        read_error_type: readError?.name,
                    }, 4);
                }
                if (elapsed >= this.#confirmationTimeout * 10) {
                    this.#tracked.delete(entry.hash);
                    this.#telemetry.emit('tx.observation_expired', {
                        ...fields, reason: 'monitoring_retention_limit', duration_ms: elapsed,
                    }, 4);
                }
            }
            this.#lastPollAt = this.#now();
        } catch (error) {
            if (!this.#closed) this.#telemetry.emit('diagnostics.read_failed', {
                component: 'msb', error_type: error?.name, reason: 'transaction_observation_failed',
            }, 4);
        } finally {
            this.#checking = false;
        }
    }

    sample() {
        if (this.#closed || !this.#unsubscribe) return;
        try {
            const now = this.#now();
            const signed = this.#state.getSignedLength();
            const unsigned = this.#state.getUnsignedLength();
            const network = this.#network.diagnostics?.() ?? {};
            if (signed > this.#lastSigned) this.#lastSignedProgressAt = now;
            if (unsigned > this.#lastUnsigned) this.#lastUnsignedProgressAt = now;
            if (signed < this.#lastSigned || unsigned < this.#lastUnsigned) {
                this.#telemetry.emit('state.length_decreased', {
                    signed_before: this.#lastSigned, signed_after: signed,
                    unsigned_before: this.#lastUnsigned, unsigned_after: unsigned,
                });
            }
            const waiting = [...this.#tracked.values()].filter(entry => entry.unsigned || entry.succeeded).length;
            const hasDemand = waiting > 0 || this.#activeBroadcasts > 0 || network.pending_commits > 0;
            if (hasDemand && this.#demandSince === null) this.#demandSince = now;
            if (!hasDemand) this.#demandSince = null;
            const stalled = hasDemand && now - Math.max(this.#demandSince, this.#lastSignedProgressAt)
                >= (this.#config.graylog?.stallTimeoutMs ?? 60000);
            if (stalled !== this.#stalled) {
                this.#telemetry.emit(stalled ? 'state.progress_stalled' : 'state.progress_resumed', {
                    signed_length: signed, unsigned_length: unsigned,
                    waiting_transactions: waiting, active_broadcasts: this.#activeBroadcasts,
                    reason: stalled ? 'pending_work_without_signed_progress' : (signed > this.#lastSigned ? 'signed_progress' : 'no_pending_work'),
                }, stalled ? 4 : 6);
                this.#stalled = stalled;
            }
            let memory = {};
            try {
                const usage = process.memoryUsage?.();
                if (usage) memory = { rss_bytes: usage.rss, heap_used_bytes: usage.heapUsed };
            } catch { /* Runtime memory metrics are optional. */ }
            const transport = {};
            for (const [name, value] of Object.entries(this.#telemetry.stats())) {
                if (typeof value === 'number' || typeof value === 'boolean') transport[`telemetry_${name}`] = value;
            }
            const counts = {};
            for (const name of ['rpc_received', 'broadcasts_started', 'send_attempts', 'send_failures', 'retries',
                'broadcasts_succeeded', 'broadcasts_failed', 'unsigned_observations', 'signed_observations']) {
                counts[name] = this.#counts[name] ?? 0;
            }
            this.#telemetry.emit('msb.progress', {
                component: 'msb', window_start_ms: this.#lastSampleAt, window_end_ms: now,
                sample_delay_ms: Math.max(0, now - this.#lastSampleAt - this.#interval),
                signed_length: signed, unsigned_length: unsigned,
                view_length_difference: unsigned - signed,
                last_signed_progress_at_ms: this.#lastSignedProgressAt,
                last_unsigned_progress_at_ms: this.#lastUnsignedProgressAt,
                confirmation_poll_last_completed_at_ms: this.#lastPollAt,
                confirmation_poll_running: this.#checking,
                active_broadcasts: this.#activeBroadcasts, tracked_transactions: this.#tracked.size,
                tracking_dropped_total: this.#trackingDropped,
                writable: this.#state.isWritable(), indexer: this.#state.isIndexer(),
                ...network, ...memory, ...counts, ...transport,
            });
            this.#counts = {};
            this.#lastSampleAt = now;
            this.#lastSigned = signed;
            this.#lastUnsigned = unsigned;
        } catch (error) {
            this.#telemetry.emit('diagnostics.snapshot_failed', {
                component: 'msb', error_type: error?.name,
            }, 4);
        }
    }

    stop() {
        if (this.#closed) return;
        this.#closed = true;
        for (const timer of this.#timers) clearInterval(timer);
        this.#timers = [];
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        this.#tracked.clear();
        this.#activeBroadcasts = 0;
    }
}
