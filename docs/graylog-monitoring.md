# MSB / RPC Graylog monitoring

This opt-in integration records validator pool changes, transaction attempts, RPC outcomes and local state progress. A blank `GRAYLOG_URL` disables the transport and the periodic diagnostic tasks. It does not change validator selection or retry policy.

## Configuration

Append these entries to the node's existing `.env` (a template is in [`.env.example`](../.env.example)):

```dotenv
GRAYLOG_APP=msb-explorer-rpc
GRAYLOG_TOKEN='replace-with-the-stream-token'
GRAYLOG_HOST=msb-explorer-rpc-01
GRAYLOG_URL='https://graylog.example.org/gelf'
```

- `GRAYLOG_APP`: stream application identifier agreed with the Graylog administrator.
- `GRAYLOG_TOKEN`: value of the `X-Graylog-Token` HTTP header.
- `GRAYLOG_HOST`: identifies **this emitting node**; it is not the Graylog server address.
- `GRAYLOG_URL`: full GELF HTTP input URL, including its path, commonly `/gelf`. This is separate from the Kuma dashboard URL.

For an HTTPS collector, run the RPC directly under Node:

```sh
npm run env-rpc-node
```

This reads `.env` and respects `STORES_DIRECTORY`, `NETWORK`, `MSB_HOST` (default `127.0.0.1`) and `MSB_PORT` (default `5000`). The existing `env-rpc` command runs through Pear. HTTP transport works in both Node and Bare/Pear. HTTPS uses Node's certificate verification; the installed Bare TLS implementation cannot provide equivalent verification, so Bare HTTPS reports `HTTPS_REQUIRES_NODE` instead of sending credentials. It never falls back to HTTP.

Plain `npm run rpc` and direct `node msb.mjs` do not load `.env`; export the variables in the process manager or use an `env-*` command. Set variables on only the node intended to send to this stream.

Optional settings:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GRAYLOG_RELEASE` | `unknown` | Git commit or deployment identifier, emitted as `git_sha` |
| `GRAYLOG_INTERVAL_MS` | `30000` | Progress summary interval |
| `GRAYLOG_STALL_TIMEOUT_MS` | `60000` | Time without signed progress while locally observed work is pending |
| `GRAYLOG_CONFIRMATION_TIMEOUT_MS` | `60000` | Local transaction observation deadline; the TX may still appear later |
| `GRAYLOG_TIMEOUT_MS` | `3000` | Collector request deadline |
| `GRAYLOG_MAX_QUEUE_SIZE` | `1000` | Maximum queued log messages |
| `GRAYLOG_CONCURRENCY` | `2` | Maximum simultaneous collector requests |

Thresholds are initial operational settings, not protocol finality guarantees. Settings are captured when `Config` is created; restart the node to apply changes. Programmatic callers can override them through `options.graylog` using camel-case property names. Telemetry is disabled under `NODE_ENV=test` unless a test explicitly sets `graylog.allowInTests: true`. The npm test scripts set `NODE_ENV=test`.

## Event fields

GELF messages use version `1.1`, an epoch timestamp in seconds, a syslog severity, and a stable event name in `short_message` and `_event`. Routine events are INFO (`6`); diagnostic failures and stalls are usually WARN (`4`), and lifecycle failures are ERROR (`3`). Extra fields are sent with `_` prefixes; Graylog normally exposes their names without the prefix.

Every running MSB supplies a `boot_id`, `node_id` and `network_id`. A restart creates a new boot identity. Provide `GRAYLOG_RELEASE` to identify the actual deployment; `package_version` is also included at startup when npm provides it.

Correlation identifiers:

- `tx_hash`: the transaction identity, shared across attempts and local observations.
- `broadcast_id`: one call to the sender, retained across recursive retries.
- `request_id`: the actual V1 protocol request ID for an individual attempt. Legacy requests do not invent a V1 ID.
- `healthcheck_id`: the local scheduled health check; its actual wire request has a separate `request_id`.
- `rpc_request_id`: one inbound RPC request. Once decoded, its `tx_hash` links it to sender events.
- `connection_id`: one physical validator connection; `pool_version` identifies changes in the local candidate pool.

`rpc_received`, send attempts and observation events are different counts. Retries do not represent newly generated transactions. An unsigned observation can be reported by both the RPC wait and the diagnostic poll; use `observation` to distinguish them and deduplicate by `tx_hash` and `boot_id` when counting transactions per node run. Booleans are encoded as strings for GELF compatibility. Important query fields stay flat; supplemental objects are bounded JSON strings.

## Situations recorded

| Events | Interpretation |
| --- | --- |
| `node.starting`, `node.started`, `node.ready`, `node.start_failed` | Startup, configuration, readiness or failure |
| `node.stopping`, `node.stopped`, `node.stop_failed` | Graceful shutdown and any failure; abrupt kills cannot emit a final event |
| `node.role_changed` | Local indexer or write-access changes |
| `validator.connect_started`, `validator.connected`, `validator.connect_failed`, `validator.connect_cancelled`, `validator.connect_ignored` | Connection attempt lifecycle and duration |
| `protocol.probe_failed`, `validator.probe_failed` | Probe result or original error before legacy fallback, and unexpected errors reaching the connection layer |
| `validator.selected` | Selected peer, attempt and available candidate count/pool version |
| `validator.removed` | Actual pool removal, reason, connection age, sent count, and pool size before/after |
| `validator.pool_empty`, `validator.pool_restored` | Loss of the last connected validator and recovery duration |
| `validator.healthcheck_failed`, `validator.observer_failed` | Peer health failures and observer failures |
| `protocol.healthcheck_failed` | Original protocol error or non-OK result, correlated with the wire request and local scheduled check |
| `network.connection_setup_failed`, `network.connection_error` | Replication connection setup and transport errors |
| `tx.broadcast_started`, `tx.broadcast_finished` | One logical send, with final success/failure and total attempts |
| `tx.send_started`, `tx.response`, `tx.send_failed`, `tx.retry` | Individual attempts, response codes, failures and actual retries |
| `tx.idempotent_success` | An already-applied operation was verified through the existing idempotency path |
| `rpc.tx_received`, `rpc.tx_decoded`, `rpc.tx_finished` | Reception, validated identity, HTTP status and outcome reason |
| `tx.broadcast_rejected`, `tx.unsigned_wait_timeout`, `tx.unsigned_wait_failed` | Distinguishes sender rejection from local visibility timeout/read failure in the broadcast API |
| `tx.unsigned_observed`, `tx.signed_observed` | Local observations during monitoring or the broadcast API's wait; a signed observation may arrive first |
| `tx.confirmation_timeout`, `tx.observation_expired` | Observation deadline and eventual monitoring retention limit |
| `state.progress_stalled`, `state.progress_resumed` | No signed-length progress with pending local work, and resolution |
| `state.length_decreased` | A view length decreased; the event does not infer the cause |
| `msb.progress` | Periodic summary, including quiet windows and transport statistics |
| `diagnostics.read_failed`, `diagnostics.snapshot_failed` | Diagnostic reads or summaries could not be completed |

Removal reasons include `message_threshold`, `response_policy`, `send_error`, health-check failures, connection closure, writer/admin policy changes and `shutdown`. A threshold rotation is routine. Inspect `result_code`, `reason`, `sent_count` and `message_threshold` to distinguish it from a failed peer.

The current V1 `ROTATE` response branch removes a validator and returns failure without itself retrying. A rejected send promise can take a different retry path. The logs describe those existing behaviors.

On a client disconnect after submission, `rpc.tx_finished` records `client_aborted` with an unknown broadcast outcome. The already submitted transaction continues, and its sender/state observations remain authoritative for the local outcome.

## Progress and observation limits

Every summary contains the actual window start/end, counts of RPC receipts, broadcasts, attempts, retries and observations, active broadcasts, connection/pending-request/pending-commit counts, transaction-pool size, observer completion time, signed/unsigned view lengths and their last change times. It also includes timer delay, available runtime memory metrics and collector counters.

`view_length_difference` is a difference in underlying view lengths, **not a count of unconfirmed transactions**. An idle node does not generate a stall warning just because no new transaction arrived. A stall needs locally observed pending work. Progress of this node alone cannot establish the health of the entire network.

`state.progress_resumed` with `reason:signed_progress` records forward movement. With `reason:no_pending_work`, it only clears the pending-work alarm; monitoring retention may have expired without the transaction being observed. A length decrease is reported separately and does not count as forward progress.

At most 1,000 transaction hashes are watched concurrently. A polling tick checks at most 50 hashes, rotating fairly through the set, normally once per second. Reads use `wait:false` and `update:false` so monitoring does not wait for remote blocks. When local data is unavailable, a deadline event sets `visibility_unknown`; it does not claim the TX is absent from the network. `tracking_dropped_total` exposes observation capacity overflow.

Observation timestamps describe when this node saw a record, not exact processing/finality timestamps. After the observation deadline, monitoring continues for up to ten times that deadline to detect late confirmations (`late:true`). A retention-expiry event means monitoring stopped; it does not prove a transaction failed. Shutdown stops timers and suppresses late reads.

## Transport behavior

Sending is asynchronous, with bounded message sizes, queue size, concurrency and deadlines. HTTP failures, unavailable collectors and serialization problems do not change a transaction's result. The transport checks HTTP status, does not follow redirects and does not retry failed log requests. A close drains for at most 1.5 seconds, then cancels remaining requests.

`msb.progress` contains counters prefixed with `telemetry_`, including sent, failed, dropped, timeouts, queued messages and in-flight requests. A collector outage can lose logs; a rate-limited local warning reports safe failure codes and counters. A successful HTTP response means the input accepted the request, not that stream routing/indexing has been independently verified.

Tokens, collector URLs, sensitive field names, arbitrary exception messages/stacks and raw transaction payloads are excluded or redacted. Use public transaction/validator identifiers and structured error/result codes for diagnosis.

## Verify the deployment

1. Fill the four variables and the release identifier, then start the intended node.
2. In the configured Graylog stream, find `app:msb-explorer-rpc AND event:node.ready`.
3. Confirm `source`/host and `node_id` identify the intended node and `git_sha` identifies the deployment.
4. Within the configured interval, verify `event:msb.progress`, including zero counts if the RPC is idle.
5. Follow an existing transaction by `tx_hash`, then inspect its `broadcast_id`, attempts and state observations.
6. Check normal rotations with `event:validator.removed AND reason:message_threshold`; inspect failures using their reason/result code.

Tests use local collectors, not production credentials. Live stream delivery must be checked after real endpoint/token values are configured.

## Scope outside this repository

This repository contains the MSB and its RPC. The explorer's `MSB_updater` database importer and its Kuma `monitor.mjs` are separate components and are not modified here. To distinguish ingestion lag from node lag, that importer still needs to report its source position, committed DB cursor, rows fetched/written, errors and last complete chart interval. The final unfinished minute must remain distinguishable from a completed zero-transaction minute.

Applications that submit through other MSB nodes need corresponding source-side observations. This node cannot log their unseen send attempts. The existing RPC `/health` remains a basic opened-state check; this change does not add Kuma pushes or redefine readiness.
