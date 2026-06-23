---
id: log
title: '@flighthq/log'
type: depth
target: log
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/log.md
  - tools/agents/docs/reviews/depth/log.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — completeness 48/100; a clean, well-built logging _seam_ sized for one job (feed the capture harness `logs.jsonl` + print gated console lines), well short of the canonical logging-library feature set the package name implies.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, genuinely-useful logger. Fills the three gaps that block real application use: only one sink, no early gating, no level-name round-trip.

- **Multi-sink fan-out (the foundational change).** In `@flighthq/types`: keep `LogSink`. In `@flighthq/log`:
  - `addLogSink(sink: LogSink): void` and `removeLogSink(sink: LogSink): boolean` (returns `false` if not present — sentinel, not throw).
  - `clearLogSinks(): void`.
  - Keep `setLogSink(sink | null)` as the explicit replace-all convenience (clear + add one, or clear when `null`), documented as such. `log()` and the wrappers iterate the sink list. Internal state becomes `_sinks: LogSink[]` instead of `_sink`.
  - Keep the emit side free: when the list is empty the forwarder is one length check.
- **Global emit-level gate.** `setLogLevel(level: LogLevel): void` / `getLogLevel(): LogLevel` — a process-wide minimum emit level checked _before_ fan-out, so a suppressed `logVerbose` does no sink work. Default `LogLevel.Verbose` (emit everything) to preserve current behavior. This is distinct from the existing console threshold (which gates only the human-readable subset inside the capture sink).
- **Lazy payload evaluation.** Widen `LogData` is wrong (it would leak into `LogEntry`); instead overload the emit functions to accept `LogData | (() => LogData)` and resolve the thunk only after the level passes the global gate. Add `type LogDataProvider = () => LogData` in `@flighthq/types`. This makes `logVerbose(() => expensiveDump(), 'render')` genuinely free in a per-frame loop.
- **Level name round-trip in the public API.** In `@flighthq/types` move the canonical name map's _contract_ here; in `@flighthq/log` export:
  - `getLogLevelName(level: LogLevel): string` (replaces internal `_levelNames`).
  - `parseLogLevel(name: string): LogLevel | null` (sentinel `null` for unknown — for tools reconstructing a level from a captured `level` string).
- **In-memory ring-buffer sink** — `createMemoryLogSink(capacity: number): LogSink` plus `getMemoryLogEntries(sink): readonly LogEntry[]` (or have `createMemoryLogSink` return `{ sink, getEntries, clear }` — prefer the explicit accessor pair to stay free-function-shaped). The "last N entries" buffer is table stakes for error reporting and the single most-asked-for non-console sink.
- **Add the package to the Package Map** in `tools/agents/docs/index.md` with stated scope ("leveled, structured, capture-aware logging: emit side + swappable sinks; not Canvas/DOM-coupled").

### Silver

Competitive with pino/winston/`tracing`: per-channel control, contextual loggers, pluggable formatting, and the common transports — with cross-cutting consistency between machine record and human view.

- **Per-channel level filtering.** `setLogChannelLevel(channel: string, level: LogLevel): void`, `getLogChannelLevel(channel: string): LogLevel | null` (null = inherits global), `clearLogChannelLevels(): void`. Resolution order in the emit gate: channel level if set, else global level. Mirrors log4j category levels / `tracing` per-target filters / `DEBUG=app:*`. Internal `_channelLevels: Map<string, LogLevel>` at file bottom.
- **Child / contextual loggers with bound fields.** A plain-data context, not a class:
  - In `@flighthq/types`: `interface LogContext { channel: string | null; fields: Readonly<Record<string, unknown>> }`.
  - `createLogContext(channel: string | null, fields?): LogContext` and `createChildLogContext(parent: Readonly<LogContext>, fields: Readonly<Record<string, unknown>>, channel?): LogContext` (merges fields, child wins).
  - Emit-with-context free functions: `logWith(context, level, data)` and `logErrorWith/.../logVerboseWith`. Bound `fields` are merged into the entry's `data` (record case) — string data is wrapped to `{ msg, ...fields }`. Keeps the no-method, free-function house style; the "logger object" is just a `LogContext` value passed explicitly.
- **Pluggable formatter seam.** In `@flighthq/types`: `type LogFormatter = (entry: Readonly<LogEntry>) => string`. In `@flighthq/log`:
  - `createJsonLogFormatter(): LogFormatter` (the current `__flight` envelope, extracted and named).
  - `createTextLogFormatter(options?): LogFormatter` (the `[channel] message` human line, with optional timestamp/level-name prefixing).
  - `createConsoleCaptureSink` gains an optional `(formatter?, options?)` so the envelope format and the human line are configurable rather than hardcoded.
- **Error-object serialization.** `serializeLogError(value: unknown): Record<string, unknown>` extracting `name/message/stack/cause` (recursively), used by the JSON formatter so an `Error` passed as data survives `JSON.stringify`. Add `LogData` acceptance of `Error` (or special-case in formatters) — decide via the formatter, not by widening the wire type.
- **Built-in transports beyond console + memory.**
  - `createBufferedLogSink(target: LogSink, options: { size?: number; intervalMs?: number }): LogSink` with a `flushLogSink(sink)` and `disposeLogSink(sink)` (detaches the interval timer — `dispose*`, since the timer is what keeps it reachable; no native resource to `destroy*`).
  - `createFilterLogSink(target: LogSink, predicate: (entry) => boolean): LogSink` — per-sink level/channel filtering by composition (each sink can now have its own threshold, the canonical multi-transport feature).
  - `createFanoutLogSink(...sinks: LogSink[]): LogSink` for nesting groups.
- **Rate limiting / sampling / dedup** (critical for a per-frame render context):
  - `createSampledLogSink(target, rate: number): LogSink` (emit 1-in-N or probability).
  - `createRateLimitedLogSink(target, options: { perChannel?: boolean; maxPerInterval: number; intervalMs: number }): LogSink`.
  - `logOnce(key: string, level, data, channel?): void` — emit a given key at most once (warmup warnings, deprecation notices).
- **Timing/measurement helpers** (the capture domain is performance-adjacent): `startLogTimer(label, channel?): LogTimer` + `endLogTimer(timer): number` (returns elapsed ms and emits a structured `Debug` entry). `LogTimer` is a plain value `{ label, channel, startedAt }` in `@flighthq/types`.

### Gold

Authoritative / AAA: nothing a logging-domain expert finds missing, full edge-case + error handling, performance, signals integration, file/remote transports behind a backend seam, and 1:1 Rust-port parity.

- **File and remote transports behind a swappable backend seam** (so the package stays web-safe and tree-shakable; the platform-suite pattern):
  - In `@flighthq/types`: `interface LogTransportBackend { write(line: string): void; flush?(): void; dispose?(): void }`.
  - `createFileLogSink(path, options?)` over a `LogTransportBackend` with `getLogTransportBackend`/`setLogTransportBackend`/`createWebLogTransportBackend` (web default = no-op / OPFS-or-download; native/Node host registers a real `fs` backend). Mirrors `@flighthq/filesystem`'s seam rather than importing it directly.
  - `createHttpLogSink(endpoint, options: { batch?; intervalMs?; headers? })` — batched remote shipping, built on `createBufferedLogSink`.
  - The **`-formats` neighbor pattern** if envelope importers/parsers grow: `@flighthq/log-formats` for reading `logs.jsonl` back into `LogEntry[]`, NDJSON/logfmt/CLF emitters — keeps parsers out of the emit bundle.
- **Field redaction & custom serializers.** `setLogRedactionPaths(paths: readonly string[])` (e.g. `['headers.authorization', 'token']`) applied in formatters; `registerLogSerializer(kind: string, fn)` keyed by a `*Kind`-style string tag for custom object types (the codebase's string-registry, last-write-wins, vendor-prefixed for user kinds).
- **Grouping / nesting & assertion conveniences.** `beginLogGroup(label, channel?)` / `endLogGroup()` (nesting depth carried in entry metadata; text formatter indents, JSON records a `depth`). `logAssert(condition, data, channel?)` — emits an `Error` entry only when the condition is false (no-op otherwise; sentinel behavior, never throws).
- **Span / scope context** aligned with the Rust `tracing` model: `createLogSpan(name, fields?, channel?)` returning a `LogSpan` value, `enterLogSpan`/`exitLogSpan`, with active-span fields auto-merged into entries emitted inside the scope. This is the bridge to first-class tracing and the natural superset of Silver's `LogContext`.
- **Signals integration (opt-in `enable*` group).** `enableLogSignals()` exposing a `LogSignals` entity (`onLogEntry`, `onLogError`) for loose multi-listener consumption with priority/cancellation, per the signals house rule — distinct from sinks (which are strict transports). Defined in `@flighthq/log`, not `@flighthq/signals`; tree-shakes away unless enabled.
- **Performance hardening & invariants.** Zero-allocation fast path when global+channel gates suppress an entry (no entry object constructed; thunk never called); benchmark suite proving suppressed `logVerbose` in a tight loop allocates nothing; `npm run size` baseline asserting the emit-only import stays near-zero.
- **Exhaustive tests & docs.** Per-sink composition tests (buffered+filter+fanout chains), rate-limit/sample distribution tests, redaction tests, formatter round-trip (`parse(format(entry)) == entry`), alias-safety for any `out`-shaped helpers, and a domain doc covering the emit/listener split, the sink-composition model, and channel/level resolution order.
- **1:1 Rust-port parity — `flighthq-log` crate.** Mirror the full surface: `LogLevel` enum, `log`/`log_error`/… free functions, `add_log_sink`/`remove_log_sink`, `set_log_level`, `set_log_channel_level`, `LogContext`/`log_with`, the sink combinators (`create_memory_log_sink`, `create_buffered_log_sink`, `create_filter_log_sink`, `create_rate_limited_log_sink`), `LogFormatter`, and the `LogTransportBackend` trait with `set_log_transport_backend` (native default = `std::fs` behind a `native` feature, off for wasm). `LogSink` = `Arc<dyn Fn(&LogEntry) + Send + Sync>`. Record any intentional TS↔Rust divergence (e.g. thunk → `FnOnce` payload) in the conformance map.

## Sequencing & effort

**Recommended order (each tier builds on the last; within Bronze the order matters):**

1. **Bronze, first: multi-sink fan-out + global emit gate** (1–2 days). This is the load-bearing redesign — `_sink` → `_sinks: LogSink[]`, and the emit functions gain a pre-fan-out level check. Everything downstream (per-sink filters, buffered/fanout sinks, signals) assumes a sink _list_. Land this before any other feature or you will refactor twice. Update existing tests for fan-out and the new gate.
2. **Bronze, rest** (1 day): lazy thunks, `getLogLevelName`/`parseLogLevel`, `createMemoryLogSink`, Package Map entry. All independent; parallelizable.
3. **Silver** (3–5 days): per-channel levels and `LogContext`/`logWith` first (they share the gate-resolution code), then the formatter seam + error serialization (extract the current hardcoded envelope into `createJsonLogFormatter`), then the sink combinators (buffered/filter/fanout/sampled/rate-limited/`logOnce`), then timers. The combinators are pure composition over Bronze's sink list — low risk, high value.
4. **Gold** (1–2 weeks): backend-seam transports (file/HTTP), redaction + custom serializers, spans, signals group, perf hardening, then the Rust crate last (it should port a settled API, not chase a moving one).

**Dependencies on other packages / `@flighthq/types`:**

- Every new shared type (`LogDataProvider`, `LogContext`, `LogFormatter`, `LogTimer`, `LogSpan`, `LogTransportBackend`, `LogSignals` payloads) lands in `@flighthq/types` **first** — the header layer — before implementation.
- Gold's file transport seam should **mirror**, not import, `@flighthq/filesystem`'s backend pattern to avoid coupling the emit bundle to filesystem code. Decision to surface: whether `createFileLogSink` reuses `@flighthq/filesystem`'s backend or defines its own `LogTransportBackend`. Recommend its own narrow seam (keeps `log` dependency-light, matching the "signals/infra should have few dependencies" rule).
- Gold's signals group depends on `@flighthq/signals` and the `enable*` convention — confirm the dependency is acceptable for a package that aims to stay near-zero in emit-only bundles (it tree-shakes unless `enableLogSignals` is called, so it is).

**Cross-package / design-decision items to surface to the user:**

- **`setLogSink` semantics change.** Keeping `setLogSink` as replace-all alongside `addLogSink` is a public-API call; confirm the rename/retention. (Recommended: keep `setLogSink(null)` as clear-all, `setLogSink(s)` as replace-with-one, for source compatibility with the capture harness.)
- **Lazy payloads via overload vs. a separate function.** Overloading `log*` to accept `() => LogData` is ergonomic but slightly complicates the type; alternative is `logLazy(level, provider, channel?)`. Recommend the overload.
- **Whether `@flighthq/log` is intended to be the full domain library** (per the AAA-completeness rule) or to stay a deliberately narrow capture seam. The depth review flags this; the roadmap assumes the former. If the SDK only ever needs the seam, Bronze alone is a defensible stopping point and Silver/Gold become optional.
- **`-formats` split timing.** Defer `@flighthq/log-formats` until there is a second reader/parser (NDJSON in + logfmt/CLF out); a single envelope reader does not justify a neighbor package yet.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/log` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
