import b4a from 'b4a';
import { randomBytes } from 'hypercore-crypto';
import { runtimeMetadata } from './runtimeMetadata.js';

const MAX_WRITERS = 32;
const MAX_PEERS = 16;
const MAX_CONNECTIONS = 128;
const MAX_DEPENDENCIES = 8;
const MAX_EVENTS = 120; // Per sampling window, plus up to 20 error events.
const MAX_LINE_BYTES = 32 * 1024;
const MAX_EVENT_BYTES = 8 * 1024;
const MAX_ERROR_BYTES = 16 * 1024;
const DETAILS_INTERVAL = 60000;
const hex = value => value && b4a.isBuffer(value) ? b4a.toString(value, 'hex') : null;
const number = value => Number.isFinite(value) ? value : null;
const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const limit = (values, max) => Array.from(values ?? []).slice(0, max);

function errorFields(error) {
    // Do not serialize arbitrary error properties (which can contain payloads/keys).
    const clean = value => String(value ?? '').replace(/\b[0-9a-f]{64,}\b/gi, '[hex omitted]').slice(0, 2048);
    return {
        error_type: clean(error?.name).slice(0, 80),
        error_code: clean(error?.code).slice(0, 80),
        error_message: clean(error?.message).slice(0, 512),
        error_stack: clean(error?.stack),
    };
}

function coreInfo(core) {
    return core ? {
        key: hex(core.key), fork: number(core.fork), length: number(core.length),
        signed_length: number(core.signedLength), contiguous_length: number(core.contiguousLength),
        opened: core.opened, closing: core.closing, closed: core.closed,
    } : null;
}

// Version-specific, observational adapter for Autobase 7.20.1 / Hypercore 11.18.3.
// No get(), update(), ack(), download(), joinPeer() or other progress-driving calls.
export default class IndexerDiagnostics {
    constructor(base, options = {}) {
        this.base = base;
        this.options = options;
        this.bootId = hex(randomBytes(16));
        this.interval = Math.max(1000, Math.min(60000, Number(options.diagnostics_interval_ms) || 10000));
        this.write = options.diagnostics_write ?? (line => console.log(line));
        this.now = options.diagnostics_now ?? Date.now;
        this.scopes = new Map();
        this.operations = new Map();
        this.timerPromises = new WeakMap();
        this.sequence = 0;
        this.connectionSequence = 0;
        this.connections = new Map();
        this.socketInfo = new WeakMap();
        this.coreListeners = new Map();
        this.peerOffset = 0;
        this.writerOffset = 0;
        this.stopped = false;
        this.timer = null;
        this.swarm = null;
        this.sent = 0;
        this.errorsSent = 0;
        this.eventBytes = 0;
        this.errorBytes = 0;
        this.totalBytes = 0;
        this.lastDetails = null;
        this.lastSampleDuration = null;
        this.verbose = options.diagnostics_verbose_events === true;
        this.suppressed = {};
        this.lastSignedChange = null;
        this.lastUnsignedChange = null;
        this.lastSample = null;
        this.previousView = null;
        this.waitingSince = null;
        this.stalled = false;
        this.install();
    }

    emit(event, fields = {}, priority = false) {
        attempt(() => {
            if (this.stopped) return;
            if (!priority && this.sent++ >= MAX_EVENTS) {
                this.suppressed[event] = (this.suppressed[event] ?? 0) + 1;
                return;
            }
            const epoch = this.now();
            const payload = {
                event: `msb.diag.${event}`, epoch_ms: epoch, timestamp: new Date(epoch).toISOString(),
                boot_id: this.bootId, writer_key: hex(this.base.local?.key),
                network_public_key: hex(this.swarm?.keyPair?.publicKey),
                indexer: this.base.isIndexer === true, ...fields,
            };
            let line = JSON.stringify(payload);
            if (b4a.byteLength(line) + 1 > MAX_LINE_BYTES && event === 'snapshot') {
                // Preserve progress/ACK evidence before optional per-peer detail.
                payload.size_limited = true;
                if (payload.network) {
                    payload.network.connections = [];
                    payload.network.connections_truncated = payload.network.connections_observed > 0;
                }
                line = JSON.stringify(payload);
                if (b4a.byteLength(line) + 1 > MAX_LINE_BYTES && payload.network) {
                    payload.network.peers = [];
                    payload.network.peers_truncated = payload.network.peer_count > 0;
                    line = JSON.stringify(payload);
                }
                if (b4a.byteLength(line) + 1 > MAX_LINE_BYTES) {
                    for (const writer of payload.writers ?? []) {
                        writer.peers = writer.active_indexer || writer.local ? (writer.peers ?? []).slice(0, 4) : [];
                        writer.peers_truncated = writer.peer_count > writer.peers.length;
                    }
                    for (const op of Object.values(payload.operations ?? {})) {
                        op.active_details_truncated = op.active.length > 1;
                        op.active = op.active.slice(0, 1);
                        if (op.last_error) op.last_error = { ...op.last_error, error_stack: undefined };
                    }
                    line = JSON.stringify(payload);
                }
                // With many blocked writers, retain indexers/local writer first.
                while (b4a.byteLength(line) + 1 > MAX_LINE_BYTES && payload.writers?.length) {
                    payload.writers.pop();
                    payload.writer_details_count = payload.writers.length;
                    payload.writer_details_truncated = true;
                    line = JSON.stringify(payload);
                }
                if (b4a.byteLength(line) + 1 > MAX_LINE_BYTES) {
                    payload.checkpoints = [];
                    payload.checkpoints_truncated = true;
                    line = JSON.stringify(payload);
                }
            }
            const bytes = b4a.byteLength(line) + 1;
            if (bytes > MAX_LINE_BYTES) {
                this.suppressed[`${event}.oversize`] = (this.suppressed[`${event}.oversize`] ?? 0) + 1;
                return;
            }
            if (event !== 'snapshot') {
                const isError = event.endsWith('.failed') || event.endsWith('.error');
                const counter = isError ? 'errorBytes' : 'eventBytes';
                const max = isError ? MAX_ERROR_BYTES : MAX_EVENT_BYTES;
                if (this[counter] + bytes > max) {
                    this.suppressed[event] = (this.suppressed[event] ?? 0) + 1;
                    return;
                }
                this[counter] += bytes;
            }
            this.write(line);
            this.totalBytes += bytes;
        });
    }

    failure(event, error, fields = {}) {
        attempt(() => this.emit(event, { ...fields, ...errorFields(error) }, this.errorsSent++ < 20));
    }

    flags() {
        const b = this.base;
        return {
            acking: b._acking, appending: b._appending !== null && b._appending !== undefined,
            draining: b._draining, paused: b.paused, interrupting: b._interrupting,
            closing: b.closing, closed: b.closed, caught_up: b._caughtup,
            fast_forwarding: b.fastForwarding != null || b.fastForwardTo != null,
            local_writer_present: !!b.localWriter, local_writer_closed: b.localWriter?.closed ?? null,
            ack_tick: number(b._ackTick), ack_tick_threshold: number(b._ackTickThreshold),
        };
    }

    // Only wraps methods on this instance. Preserve this, return values and errors;
    // never repair flags or consume a rejection. No base 'error' listener is added.
    wrap(scope, object, method, makeWrapper) {
        if (!object || typeof object[method] !== 'function') return;
        const original = object[method];
        const own = Object.prototype.hasOwnProperty.call(object, method);
        const wrapped = makeWrapper(original);
        object[method] = wrapped;
        if (!this.scopes.has(scope)) this.scopes.set(scope, []);
        this.scopes.get(scope).push(() => {
            if (object[method] !== wrapped) return;
            if (own) object[method] = original;
            else delete object[method];
        });
    }

    restore(scope) {
        for (const undo of this.scopes.get(scope) ?? []) attempt(undo);
        this.scopes.delete(scope);
    }

    install() {
        const diag = this;
        attempt(() => {
            this.wrap('base', this.base, 'ack', original => function (...args) {
                attempt(() => diag.refreshHooks());
                return diag.trace('ack', original, this, args);
            });
            this.wrap('base', this.base, '_advance', original => function (...args) {
                return diag.trace('advance', original, this, args);
            });
            this.wrap('base', this.base, 'append', original => function (...args) {
                // Only observe null ACK appends. Transaction payloads are never recorded.
                return args[0] === null ? diag.trace('ack_append', original, this, args) : original.apply(this, args);
            });
            this.wrap('base', this.base, '_startAckTimer', original => function (...args) {
                const result = original.apply(this, args);
                attempt(() => diag.refreshHooks());
                return result;
            });
            this.wrap('base', this.base, '_onError', original => function (error, ...args) {
                diag.failure('autobase.error', error);
                return original.call(this, error, ...args);
            });
            this.refreshHooks();
        });
    }

    refreshHooks() {
        const diag = this;
        for (const [scope, object, method, kind] of [
            ['ack_timer', this.base._ackTimer, '_execute', 'ack_timer'],
            ['apply_state', this.base._applyState, 'shouldWrite', 'should_write'],
            ['linearizer', this.base.linearizer, 'shouldAck', 'should_ack'],
        ]) {
            if (this[scope] === object) continue;
            this.restore(scope);
            this[scope] = object;
            this.wrap(scope, object, method, original => function (...args) {
                return diag.trace(kind, original, this, args);
            });
        }
    }

    trace(kind, fn, receiver, args) {
        if (this.stopped) return fn.apply(receiver, args);
        const token = attempt(() => this.begin(kind));
        let result;
        try { result = fn.apply(receiver, args); } catch (error) {
            attempt(() => this.finish(token, error, true));
            throw error;
        }
        if (result && typeof result.then === 'function') {
            const observation = { state: 'pending', attempt_id: token?.id ?? null };
            const wrapped = result.then(value => {
                observation.state = 'fulfilled';
                attempt(() => this.finish(token, value, false));
                return value;
            }, error => {
                observation.state = 'rejected';
                attempt(() => this.finish(token, error, true));
                throw error;
            });
            if (kind === 'ack_timer') this.timerPromises.set(wrapped, observation);
            return wrapped;
        }
        attempt(() => this.finish(token, result, false));
        return result;
    }

    begin(kind) {
        if (this.stopped) return null;
        let op = this.operations.get(kind);
        if (!op) {
            op = { started: 0, completed: 0, failed: 0, active: new Map(), untracked_active: 0, last: null };
            this.operations.set(kind, op);
        }
        const token = { kind, id: ++this.sequence, started_at_ms: this.now(), local_length_before: number(this.base.local?.length) };
        if (kind === 'ack') {
            const b = this.base;
            // Describe only guards visible at entry, not an inferred reason for a later return.
            token.entry_skip_reason = !b.opened ? null : b.localWriter === null ? 'no_local_writer'
                : b._acking ? 'already_acking' : b._interrupting ? 'interrupting'
                    : b._appending != null ? 'appending' : null;
        }
        op.started++;
        op.last_started_at_ms = token.started_at_ms;
        if (op.active.size < 32) op.active.set(token.id, token);
        else op.untracked_active++;
        if (this.verbose && (kind === 'ack' || kind === 'ack_timer' || kind === 'ack_append')) {
            this.emit(`${kind}.started`, { ...token, flags: this.flags() });
        }
        return token;
    }

    finish(token, result, failed) {
        if (!token || this.stopped) return;
        const op = this.operations.get(token.kind);
        if (!op.active.delete(token.id)) op.untracked_active--;
        const finished = this.now();
        const last = {
            ...token, finished_at_ms: finished, duration_ms: finished - token.started_at_ms,
            failed, local_length_after: number(this.base.local?.length),
            decision: typeof result === 'boolean' ? result : null,
        };
        op[failed ? 'failed' : 'completed']++;
        op.last = last;
        if (failed) {
            op.last_error = { at_ms: finished, ...errorFields(result) };
            this.failure(`${token.kind}.failed`, result, { ...last, flags: this.flags() });
        } else if (this.verbose && (token.kind === 'ack' || token.kind === 'ack_timer' || token.kind === 'ack_append')) {
            this.emit(`${token.kind}.completed`, { ...last, flags: this.flags() });
        }
    }

    start() {
        if (this.timer || this.stopped) return;
        this.emit('started', {
            ...runtimeMetadata(), interval_ms: this.interval,
            details_interval_ms: DETAILS_INTERVAL, verbose_events: this.verbose,
            adapter: 'autobase-7.20.1/hypercore-11.18.3/hyperswarm-4.14.2',
            limits: { writers: MAX_WRITERS, peers_per_core: MAX_PEERS, peers_per_sample: MAX_CONNECTIONS,
                line_bytes: MAX_LINE_BYTES, event_bytes_per_interval: MAX_EVENT_BYTES, error_bytes_per_interval: MAX_ERROR_BYTES },
        }, true);
        this.sample();
        this.timer = setInterval(() => this.sample(), this.interval);
        this.timer.unref?.();
    }

    attachNetwork(swarm) {
        if (this.stopped) return;
        attempt(() => {
            this.swarm = swarm;
            const diag = this;
            for (const method of ['joinPeer', 'leavePeer']) {
                this.wrap('swarm', swarm, method, original => function (key, ...args) {
                    const before = attempt(() => diag.peerInfo(this.peers.get(hex(key))));
                    const result = original.call(this, key, ...args);
                    diag.emit(`peer.${method}`, { peer: hex(key), before, after: attempt(() => diag.peerInfo(this.peers.get(hex(key)))) });
                    return result;
                });
            }
            // Hyperswarm emits 'connection' only after a successful handshake.
            // Also observe outgoing sockets that time out before that event.
            this.wrap('swarm', swarm, '_connect', original => function (peer, ...args) {
                let result;
                try { result = original.call(this, peer, ...args); } catch (error) {
                    diag.failure('peer.connect_failed', error, { peer: hex(peer.publicKey) });
                    throw error;
                }
                attempt(() => {
                    const connection = this._allConnections.get(peer.publicKey);
                    if (connection) diag.trackConnection(connection, peer, 'connecting');
                });
                return result;
            });
            this.emit('network.attached', {}, true);
        });
    }

    trackConnection(connection, peerInfo, stage = 'accepted') {
        if (this.stopped) return;
        attempt(() => {
            if (this.socketInfo.has(connection)) {
                const record = this.socketInfo.get(connection);
                if (stage === 'accepted' && record.opened_at_ms === null) {
                    record.opened_at_ms = this.now();
                    record.stage = stage;
                    this.emit('connection.opened', { ...this.connectionInfo(connection, record), peer_state: this.peerInfo(peerInfo) });
                }
                return;
            }
            const record = {
                connection_id: `${this.bootId}:${++this.connectionSequence}`,
                peer: hex(connection.remotePublicKey) ?? hex(peerInfo?.publicKey),
                observed_at_ms: this.now(), opened_at_ms: stage === 'accepted' ? this.now() : null, stage,
            };
            this.socketInfo.set(connection, record);
            this.connections.set(connection, record);
            const diag = this;
            // Observe before async setup without adding an error listener: an error
            // that was previously unhandled must retain its original semantics.
            this.wrap(connection, connection, 'emit', original => function (event, ...args) {
                attempt(() => {
                    if (event === 'error') diag.failure('connection.error', args[0], diag.connectionInfo(this, record));
                    if (event === 'close') {
                        diag.emit('connection.closed', diag.connectionInfo(this, record));
                        diag.connections.delete(this);
                        diag.restore(this);
                    }
                });
                return original.call(this, event, ...args);
            });
            this.emit(stage === 'accepted' ? 'connection.opened' : 'connection.attempted', {
                ...this.connectionInfo(connection, record), peer_state: this.peerInfo(peerInfo),
            });
        });
    }

    connectionStage(connection, stage, error) {
        if (this.stopped) return;
        attempt(() => {
            const record = this.socketInfo.get(connection);
            if (!record) return;
            record.stage = stage;
            if (error) this.failure('connection.setup_failed', error, this.connectionInfo(connection, record));
            else this.emit('connection.stage', this.connectionInfo(connection, record));
        });
    }

    connectionInfo(connection, record = this.socketInfo.get(connection)) {
        return {
            ...record, age_ms: record ? this.now() - record.observed_at_ms : null,
            initiator: connection.isInitiator, destroyed: connection.destroyed,
            bytes_read: number(connection.rawBytesRead), bytes_written: number(connection.rawBytesWritten),
            peer: hex(connection.remotePublicKey) ?? record?.peer ?? null,
        };
    }

    peerInfo(peer) {
        if (!peer) return null;
        return {
            peer: hex(peer.publicKey), explicit: peer.explicit, waiting: peer.waiting,
            queued: peer.queued, attempts: peer.attempts, reconnecting: peer.reconnecting,
            banned: peer.banned, client: peer.client, proven: peer.proven,
            connected_at_ms: number(peer.connectedTime), disconnected_at_ms: number(peer.disconnectedTime),
        };
    }

    connectRequested(publicKey, type) {
        attempt(() => this.emit('peer.connect_requested', {
            peer: publicKey, role: type,
            retained: this.swarm?.peers.has(publicKey),
            peer_state: this.peerInfo(this.swarm?.peers.get(publicKey)),
        }));
    }

    watchCore(core) {
        if (!core || this.coreListeners.has(core)) return;
        const stats = { attached_at_ms: this.now(), downloaded_blocks: 0, uploaded_blocks: 0, last_download_at_ms: null, last_upload_at_ms: null };
        const download = (index, bytes, peer) => attempt(() => {
            stats.downloaded_blocks++;
            stats.last_download_at_ms = this.now();
            stats.last_download_index = index;
            stats.last_download_peer = hex(peer?.remotePublicKey);
        });
        const upload = () => attempt(() => { stats.uploaded_blocks++; stats.last_upload_at_ms = this.now(); });
        core.on('download', download);
        core.on('upload', upload);
        this.coreListeners.set(core, { stats, detach: () => { core.removeListener('download', download); core.removeListener('upload', upload); } });
    }

    writerInfo(writer, details) {
        const core = writer.core;
        const next = writer.nodes?.length;
        // Bitfield belongs to the current core state; don't apply it to another fork/session.
        const hasNext = core.opened && core.state === core.core?.state && Number.isInteger(next)
            ? core.core?.bitfield?.get(next) ?? null : null;
        const pending = writer.node?.heads?.slice(writer.node.dependencies?.size ?? 0) ?? [];
        const peers = core.peers ?? [];
        return {
            core: coreInfo(core), local: hex(core.key) === hex(this.base.local?.key),
            active_indexer: writer.isActiveIndexer, removed: writer.isRemoved, frozen: writer.frozen,
            processed_length: number(writer.length), available_length: number(writer.available),
            indexed_length: number(writer.indexed), seen_length: number(writer.seenLength),
            next_block_index: number(next), has_next_block: hasNext,
            pending_dependency_count: pending.length,
            pending_dependencies: pending.slice(0, MAX_DEPENDENCIES).map(head => {
                const dep = this.base.activeWriters?.get(head.key);
                return { writer_key: hex(head.key), required_length: head.length,
                    known_length: number(dep?.core?.length), processed_length: number(dep?.length),
                    available_length: number(dep?.available), frozen: dep?.frozen ?? null };
            }),
            io: this.coreListeners.get(core)?.stats ?? null,
            peer_count: peers.length, peers_truncated: peers.length > (details ? MAX_PEERS : 0),
            peers: (details ? peers.slice(0, MAX_PEERS) : []).map(peer => ({
                peer: hex(peer.remotePublicKey), connection_id: this.socketInfo.get(peer.stream)?.connection_id ?? null,
                remote_length: number(peer.remoteLength), remote_fork: number(peer.remoteFork),
                remote_opened: peer.remoteOpened, remote_synced: peer.remoteSynced,
                remote_advertises_next_block: Number.isInteger(next) && peer.remoteOpened ? peer.remoteBitfield?.get(next) ?? null : null,
                inflight: number(peer.inflight), data_processing: number(peer.dataProcessing),
                requests_sent: number(peer.stats?.wireRequest?.tx), data_received: number(peer.stats?.wireData?.rx),
                paused: peer.paused,
            })),
        };
    }

    sample(forceDetails = false) {
        if (this.stopped) return;
        try {
            this.refreshHooks();
            const now = this.now();
            const b = this.base;
            const view = coreInfo(b.view?.core);
            const sameView = view && this.previousView?.key === view.key && this.previousView?.fork === view.fork;
            if (!sameView) {
                this.lastSignedChange = null;
                this.lastUnsignedChange = null;
                this.waitingSince = null;
                this.stalled = false;
            } else {
                if (view.signed_length > this.previousView.signed_length) this.lastSignedChange = now;
                if (view.length > this.previousView.length) this.lastUnsignedChange = now;
            }
            const signedProgress = sameView && view.signed_length > this.previousView.signed_length;
            const waiting = view && view.length > view.signed_length;
            if (!waiting || signedProgress) this.waitingSince = null;
            if (waiting && this.waitingSince === null) this.waitingSince = now;
            const stalled = waiting && now - this.waitingSince >= 60000;
            const details = forceDetails || this.lastDetails === null || now - this.lastDetails >= DETAILS_INTERVAL || (stalled && !this.stalled);
            if (stalled !== this.stalled) this.emit(stalled ? 'progress.stalled' : 'progress.resumed', {
                reason: stalled ? 'unsigned_gap_without_signed_progress' : signedProgress ? 'signed_progress' : 'gap_cleared', view,
            }, true);
            this.stalled = stalled;

            const allWriters = Array.from(b.activeWriters ?? []);
            const important = allWriters.filter(w => w.isActiveIndexer || w === b.localWriter);
            const other = allWriters.filter(w => !important.includes(w) && (w.node || w.frozen || w.length < w.core.length || w.seenLength > w.core.length));
            const selected = important.slice(0, MAX_WRITERS);
            const slots = MAX_WRITERS - selected.length;
            for (let i = 0; i < Math.min(slots, other.length); i++) selected.push(other[(this.writerOffset + i) % other.length]);
            this.writerOffset = other.length ? (this.writerOffset + slots) % other.length : 0;
            const cores = new Set(selected.map(w => w.core));
            for (const [core, record] of this.coreListeners) {
                if (!cores.has(core)) { record.detach(); this.coreListeners.delete(core); }
            }
            for (const core of cores) this.watchCore(core);
            const writers = selected.map(w => attempt(() => this.writerInfo(w, details), { writer_key: hex(w.core?.key), unavailable: true }));
            const state = b._applyState;
            const checkpoints = limit(state?.checkpoints, MAX_WRITERS).map(chk => ({
                writer_key: hex(chk.core?.key), signer: chk.signer, log_length: number(chk.length),
                system_key: hex(chk.digest?.key), paused: chk.paused, closed: chk.closed,
                system_signed_length: number(chk.signatures?.system?.length),
                views: limit(chk.signatures?.user, 8).map((sig, index) => ({ index, length: number(sig?.length), at: number(sig?.at) })),
            }));
            const operations = {};
            for (const [kind, op] of this.operations) operations[kind] = {
                ...op, active_count: op.active.size + op.untracked_active,
                active: Array.from(op.active.values(), token => ({ ...token, age_ms: now - token.started_at_ms })),
            };
            const peers = Array.from(this.swarm?.peers?.values() ?? []);
            const peerSample = [];
            if (details) {
                for (let i = 0; i < Math.min(peers.length, MAX_CONNECTIONS); i++) peerSample.push(this.peerInfo(peers[(this.peerOffset + i) % peers.length]));
                this.peerOffset = peers.length ? (this.peerOffset + MAX_CONNECTIONS) % peers.length : 0;
            }
            this.emit('snapshot', {
                details_included: details, last_details_at_ms: this.lastDetails,
                previous_sample_duration_ms: this.lastSampleDuration,
                log_bytes_before_sample: this.totalBytes,
                sample_delay_ms: this.lastSample === null ? null : Math.max(0, now - this.lastSample - this.interval),
                view, system: coreInfo(b.system?.core), local: coreInfo(b.local),
                last_signed_progress_at_ms: this.lastSignedChange, last_unsigned_progress_at_ms: this.lastUnsignedChange,
                waiting_since_ms: this.waitingSince, stalled,
                flags: this.flags(), operations,
                ack_timer: { present: !!b._ackTimer, executing_present: b._ackTimer?._executing != null,
                    executing_observation: this.timerPromises.get(b._ackTimer?._executing) ?? null,
                    stopped: b._ackTimer?._stopped, asap: b._ackTimer?._asap,
                    start_ms: number(b._ackTimer?._start), interval_ms: number(b._ackTimer?.interval) },
                quorum: number(state?.quorum), checkpoints,
                checkpoint_count: state?.checkpoints?.length ?? 0,
                checkpoint_views: limit(b.system?.views, 8).map((v, index) => ({ index, key: hex(v.key), length: number(v.length) })),
                indexers: limit(b.system?.indexers, MAX_WRITERS).map(idx => ({ writer_key: hex(idx.key), system_position: idx.length })),
                writer_count: allWriters.length, writer_details_count: writers.length,
                writer_details_truncated: important.length + other.length > selected.length, writers,
                network: this.swarm ? {
                    peer_count: peers.length, peers_truncated: peers.length > peerSample.length, peers: peerSample,
                    connected: this.swarm.connections?.size, all_connections: this.swarm._allConnections?.size,
                    connecting: this.swarm.connecting, queued: this.swarm._queue?.length,
                    explicit_peers: this.swarm.explicitPeers?.size, suspended: this.swarm.suspended,
                    max_peers: number(this.swarm.maxPeers), max_parallel: number(this.swarm.maxParallel),
                    retry_backoffs_ms: this.swarm._timer?.backoffs?.slice(0, 4),
                    client_attempts: this.swarm.stats?.connects?.client?.attempted,
                    connections_observed: this.connections.size, connections_truncated: this.connections.size > (details ? MAX_CONNECTIONS : 0),
                    connections: details ? Array.from(this.connections).slice(0, MAX_CONNECTIONS).map(([c, r]) => this.connectionInfo(c, r)) : [],
                } : null,
                suppressed_events: this.suppressed,
            }, true);
            this.previousView = view;
            this.lastSample = now;
            if (details) this.lastDetails = now;
            this.lastSampleDuration = this.now() - now;
            this.sent = 0;
            this.errorsSent = 0;
            this.eventBytes = 0;
            this.errorBytes = 0;
            this.suppressed = {};
        } catch (error) {
            this.failure('snapshot.failed', error);
        }
    }

    stop() {
        if (this.stopped) return;
        this.sample();
        this.emit('stopped', {}, true);
        this.stopped = true;
        clearInterval(this.timer);
        this.timer = null;
        for (const scope of this.scopes.keys()) this.restore(scope);
        for (const record of this.coreListeners.values()) attempt(record.detach);
        this.coreListeners.clear();
        this.connections.clear();
    }
}
