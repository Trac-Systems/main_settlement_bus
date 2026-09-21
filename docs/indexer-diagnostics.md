# Indexer diagnostics on 0.2.5-diag-logs

This branch adds observational JSON logs to identify why an indexer stops
finalizing. It does not fix ACKs, change quorum, retry connections, or alter the
installed dependencies. Nothing in this change deploys or restarts a process.

## Enable and collect

The normal `msb.mjs` entrypoint enables diagnostics with:

```js
enable_indexer_diagnostics: true,
diagnostics_interval_ms: 10000,
diagnostics_verbose_events: false,
```

The RPC entrypoint explicitly disables them. Library users opt in through the
same options; the library default is off. Logging is not gated on the current
indexer role, so startup and role transitions are visible too. The intended
deployment is on all three indexers. Set `enable_indexer_diagnostics: false` to
disable instrumentation on a subsequent start.

By default successful ACK/timer/ACK-append calls are summarized in `snapshot`
rather than printed individually. Failures are emitted immediately within the
reserved error budget. `diagnostics_verbose_events: true` enables individual
start/completion events, subject to the same byte/event limits.

Core/writer progress and ACK state are sampled every 10 seconds. Per-peer and
per-socket detail is included at most every 60 seconds during healthy operation,
and additionally when a stall is first detected. `details_included`, per-list
truncation flags and `size_limited` describe what was retained in a snapshot.

Each diagnostic is a single JSON line on stdout with an `msb.diag.*` event name,
UTC `timestamp`, `epoch_ms`, `boot_id`, local `writer_key`, and
`network_public_key`. Initial events can have null identities before the network
is initialized. `network.attached` provides the local writer/network-key mapping;
combine that mapping from all indexers to identify sockets. A replication peer
can serve another indexer's core; its network key is not necessarily that core's
writer key.

`started` includes the checkout HEAD read at startup, package versions, source
file fingerprints, runtime, and sampling limits. HEAD does not certify a clean
working tree or identify all modified dependencies. Missing metadata is null.
Fingerprints are BLAKE2b-256 of the named source files at startup. No environment,
wallet files, private keys, transaction payloads, or signature bytes are read
for telemetry. Error logs select only type, code, truncated message and stack;
long hex strings in error text are redacted.

For PM2, preserve the existing stdout/stderr logs for **each indexer**, including
the time before a stall and before any restart. A read-only filter is:

```sh
rg 'msb\.diag\.' /path/to/indexer-out.log
```

The normal PM2 timestamp prefix may precede the JSON. There is no new HTTP
endpoint and no need to enable RPC on the indexers.

## Events

| Event suffix | Meaning |
| --- | --- |
| `snapshot` | Independent periodic, synchronous in-memory sample |
| `ack.started/completed/failed` | Invocation of Autobase `ack()`; start/completion require verbose mode |
| `ack_timer.started/completed/failed` | Execution of the ACK timer handler; start/completion require verbose mode |
| `ack_append.started/completed/failed` | Invocation/result of `append(null)`; start/completion require verbose mode |
| `should_write.failed`, `should_ack.failed`, `advance.failed`, `apply.failed` | Exception from the observed operation |
| `autobase.error` | Error reaching Autobase's existing `_onError` path |
| `connection.attempted/opened/stage/error/closed/setup_failed` | Socket lifecycle, with an ID unique to that socket, including outgoing handshake failures |
| `peer.connect_requested` | Application request to connect, including retained peer state |
| `peer.joinPeer/leavePeer` | Existing application/library call and peer state before/after |
| `peer.connect_failed` | Synchronous error from Hyperswarm's outgoing connection dispatch |
| `progress.stalled/resumed` | Local view gap without sampled signed progress for 60 seconds, or recovery |
| `snapshot.failed` | Diagnostic adapter could not complete a sample |
| `stopped` | Diagnostic cleanup during normal application shutdown |

`ack.completed` does **not** mean a record was appended or finalization advanced.
ACK may return early. `entry_skip_reason` records guards visible at entry;
`should_write` and `should_ack` operation summaries include their last boolean
decision. An `ack_append.completed` reports completion of `append(null)`; Autobase
may coalesce it with pending work. Local-length changes over an invocation are
observations, not attribution of every appended record to that invocation.

Operation summaries contain cumulative started/completed/failed counts, active
invocations and their ages, the last result and the last error. Start/end times
and durations use the local wall clock. Synchronize clocks when correlating
machines. Timer `executing_observation` describes the **exact promise** retained
in `_executing`, when instrumented: `pending`, `fulfilled`, or `rejected`.
Null means it was not observed; it is not evidence of a healthy timer.

`previous_sample_duration_ms` measures the prior sample's construction and log
write call, using the local clock. `log_bytes_before_sample` is the cumulative
number of diagnostic bytes submitted to the log sink before this snapshot. It
does not confirm that a downstream log collector has persisted those bytes.

## Read a blackout

1. Match the same view core key and fork across nodes. Compare `view.length` and
   `view.signed_length`; system core lengths are a different coordinate system.
   `last_*_progress_at_ms` is a sampled observation, initially null, and resets
   if the view key/fork changes. The stall clock starts when an unsigned gap is
   first sampled, not at the last transaction or the start of an idle interval.
   `resumed` requires reading `reason`; a cleared gap alone is not new signing.
2. Check ACK failures and active invocation ages. A failed ACK followed by
   `flags.acking=true`, subsequent `already_acking` returns and a rejected timer
   promise is evidence of the retained-state mechanism. A pending invocation
   is an unresolved wait, not a proven rejection. `operations.should_write`,
   `operations.advance` and `operations.apply` help identify the active stage.
3. Compare `local.length` on the writer's own node with that writer's
   `writers[].core.length` and `processed_length` on the other nodes. Core
   length can be known while blocks are missing. `has_next_block` checks only
   the in-memory bitfield for `next_block_index` in the current core state;
   null means unknown. It does not request or fetch data.
4. Inspect `pending_dependencies`: writer key, required length, known length,
   and processed length. Ordinary/removed writers can be prerequisites too.
   `available_length`, `processed_length`, `indexed_length`, `seen_length` and
   system `indexers[].system_position` have distinct meanings. They are local
   Autobase observations, not live measurements of another host.
5. Compare checkpoints by `writer_key` and `system_key`. System checkpoint
   lengths are separate from application-view checkpoint lengths; `views[].index`
   corresponds to `checkpoint_views` for the sampled system. Log lengths are
   checkpoint-reader positions, not MSB signed lengths.
6. For missing data, inspect peers for that specific core: advertised remote
   length/fork, remote-opened state, requests, data received, inflight work and
   last download. Correlate with the socket ID and peer retry state. A TCP/UDP
   transport or a validator-pool entry alone does not prove replication works.
   `connection.stage=replicating` means replication setup was invoked, not that
   any particular core is synchronized. `leavePeer` alone is not a socket close.

The sampling interval is independent of ACK and observer scheduling, but runs
on the same event loop. `sample_delay_ms` exposes delays after execution resumes;
a completely blocked process cannot emit snapshots while blocked.

## Scope, overhead and limitations

- The adapter targets Autobase 7.20.1, Hypercore 11.18.3 and Hyperswarm 4.14.2.
  It wraps methods on the existing instances, including the ACK timer, and
  restores them on shutdown. No dependency files or prototypes are patched.
  Wrappers preserve receiver, values and rejections, but add logging overhead
  and promise continuations. This is instrumentation, not a zero-overhead probe.
- Socket `emit` is observed before asynchronous protocol setup. The original
  emitter is always called; no diagnostic error listener is added to suppress
  a formerly unhandled socket or Autobase error.
  Outgoing sockets are captured through the existing Hyperswarm `_connect`
  call, before a successful `connection` event. `observed_at_ms` is the first
  observation; `opened_at_ms` is null until the application accepts the socket.
- Sampling never calls `get`, `update`, `ack`, `download`, `joinPeer`, or opens
  another Corestore. Source/package metadata is read once at startup.
- Each interval allows at most 8 KiB of ordinary events and 16 KiB of errors,
  with a further cap of 120 ordinary events and 20 reserved error events.
  Further events are counted in `suppressed_events`; snapshots have a separate
  32 KiB line budget (including a newline). No individual diagnostic line may
  exceed that budget. Large snapshots omit socket detail first, then general
  peer detail, then reduce writer peers, active invocation detail and writer
  count. Indexer/local-writer information takes priority. This produces
  `size_limited` and per-list truncation flags; an omitted list is not empty
  network state. Detailed lists are additionally bounded: 32 writers, 16 peers per writer,
  8 pending dependencies per writer, and 128 swarm peers/connections per sample.
  Indexers and the local writer take priority. Other writers with pending work
  and the swarm peer list rotate between samples. Truncation is reported.
- Writer download/upload counters start when that core is selected for
  observation (`io.attached_at_ms`) and reset after detachment/reselection.
  Remote bitfields and lengths are peer advertisements, not an independent
  verification that the remote host can deliver the data.
- Snapshot construction is synchronous but covers multiple components whose
  I/O can change between samples. A local stall does not establish a global
  stall. Quorum 2/3 still requires available histories and working ACKs.
- Output goes through stdout; use the deployment's existing log collection and
  rotation. A blocked stdout can still delay the process; byte limits reduce
  volume but cannot guarantee nonblocking output. Protect log retention before a restart. The module cannot recover
  prior socket/timer state from the database after a restart.

## Validation

```sh
./node_modules/.bin/brittle-node -t 30000 tests/unit/network/IndexerDiagnostics.test.js
./node_modules/.bin/brittle-bare -t 30000 tests/unit/network/IndexerDiagnostics.test.js
./node_modules/.bin/brittle-node -t 30000 tests/unit/state/StateDiagnostics.test.js
```

Tests cover injected ACK/timer rejection using the installed implementation,
unresolved waits, throwing log sinks, socket replacement, bounded event logging,
hook cleanup, live writer/checkpoint sampling, and three isolated Autobases with
in-memory replication. A clean disconnection of one indexer leaves the other two
able to finalize in that test. This does not reproduce or explain the production
blackout, and the injected error does not establish its natural trigger.

A synthetic sizing run of 600 samples at simulated 10-second intervals produced
about 63 MiB/day of snapshots for 3 writers, 8 peers per core and 64 sockets,
and 171 MiB/day for 32 writers, 16 peers per core and 128 sockets. These are
fixture-specific projections, excluding other events, operation history, log
prefixes and collector overhead. They are not production volume or throughput
measurements; the sink only counted bytes and did not exercise stdout or disk.
