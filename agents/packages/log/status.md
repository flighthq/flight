---
package: '@flighthq/log'
updated: 2026-08-08
by: principal
---

# log — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/log/src/` and `packages/types/src/` on 2026-08-30.

- **All 62 exports live in one `log.ts` (792 lines).** Sinks, level gates, formatters, combinators,
  rate limiting, timers, groups, spans, redaction, serializers, and the transport owner are one
  file. [file naming](../../conventions/file-naming.md) says to cut at concept boundaries, not one
  file per package — this is the largest single-file package surface in the SDK, and `contract.ts` is
  a one-line re-export of it.
- **`enableLogSignals` is one-way and changes the emit gate for the process.** There is no
  `disableLogSignals` anywhere, and `_passesLevelGate` returns early only when
  `_sinks.length === 0 && _logSignals === null` (`log.ts:752`) — so once signals are enabled, a
  zero-sink configuration no longer takes the fast path. Tests that call it contaminate every later
  test in the file.
- **Ten module-level mutable values:** `_channelLevels`, `_onceKeys`,
  `_redactionPaths`, `_serializers`, `_sinks`, `_spanStack`, `_consoleLevel`, `_groupDepth`,
  `_level`, `_logSignals`. All but `_onceKeys` and `_logSignals` have an
  exported clear/reset; those two are process-lifetime by design, and `_onceKeys` has no reset at
  all, which constrains any test asserting on `logOnce`.
- **No allocation benchmark.** The suppressed-`logVerbose` fast path gates before constructing
  anything, but nothing proves it — there is no `log.bench.ts`, and no `*.bench.ts` exists anywhere
  in `packages/`.
- **No `createHttpLogSink`.** Explicit `LogTransport` injection plus `createBufferedLogSink` is the
  composable equivalent; a built-in would need rulings on fetch credentials, retry, CORS, and queue
  overflow. Deliberately deferred, not forgotten.
- **No Rust crate.** `crates/` does not exist in this repo, so `flighthq-log` has no upstream to
  mirror yet. Recorded mapping for whoever starts it: `LogDataProvider` → `FnOnce` closure,
  `LogSink` → `Arc<dyn Fn(&LogEntry) + Send + Sync>`.
- **No `@flighthq/log-formats` neighbor.** A `logs.jsonl` → `LogEntry[]` parser and NDJSON/logfmt
  emitters wait on a second reader consumer; one envelope reader does not justify a package.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Replaced the zero-provider Host/ambient transport seam with an injected, owned
  `LogTransport` Entity. `createFileLogSink` pins one destination; synchronous FIFO admission and
  awaited delivery/destroy outcomes are explicit; teardown unregisters first, attempts destroy after
  flush failure, preserves both outcomes, and is terminal/idempotent. The old Host slot, Has trait,
  optional operations, selector/operation helpers, global slot, and false Web-provider claims are gone.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Biggest false claim dropped: the parked
  cross-boundary item "fix the `LogTransportBackend.ts` reference to `createHttpLogSink`" — there is
  no `packages/types/src/LogTransportBackend.ts` (the log types are consolidated into `Log.ts` plus
  the four opaque sink-handle files), and `createHttpLogSink` appears nowhere in the repo, so there
  is no reference to fix. Also dropped: "add `@flighthq/log` to the `npm run size` baseline" — the
  `log-console` fixture is already in `tools/size/fixtures/` and `tools/size/size.baseline.json`;
  and the pointer to `math.bench.ts` as the pattern to copy, since no bench file exists.
- **2026-06-25** — Historical note corrected 2026-08-30: the supposed
  `createWebLogTransportBackend` did not exist; the old architecture inventory had treated the
  ambient sentinel path as a Web factory. There was no shipped Web transport to rewrite.
- **2026-06-24** — Gold pass: file transport backend seam (`createFileLogSink` +
  `get`/`setLogTransportBackend`), field redaction, `__kind` serializer registry, group nesting,
  spans, and `enableLogSignals`.
- **2026-06-24** — Silver pass: contextual loggers, `logAssert`/`logOnce`, JSON and text formatters,
  error serialization, the buffered/filter/fanout/rate-limited/sampled sink combinators, and timers.
