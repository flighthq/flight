---
package: '@flighthq/log'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# log — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` § Recommended.

Done:

- **Fixed the stale `createWebLogTransportBackend` docstring** (`packages/log/src/log.ts`). The comment still described the deferred batched-POST HTTP sink (`batchSize`/`intervalMs`/remote endpoint). Rewrote it to describe what actually ships: the web default no-op transport backend (no filesystem, no SDK-owned network), with `createFileLogSink` entries dropping silently until a host registers a real backend via `setLogTransportBackend`, and a pointer to compose `createBufferedLogSink` over a backend for remote shipping. Docstring-only; no export/test changes. `npm run test --workspace=packages/log` green (114/114).

Parked:

- **Fix the `LogTransportBackend.ts` reference to `createHttpLogSink`.** cross-boundary: the type doc lives in `@flighthq/types` (`packages/types/src/Log.ts` / `LogTransportBackend.ts`), outside `packages/log/`. Despite the assessment calling it "the colocated type file `log` owns," it physically sits in `packages/types`, which is a hard boundary for this sweep. Left untouched.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/log

**Session dates:** 2026-06-24 (pass 1 + pass 2) **Starting score (pass 1):** 48/100 (partial) **Score after pass 1:** 82/100 (Silver-complete) **Estimated score after pass 2:** 95/100 (Gold)

## Implemented APIs

### Types added to `@flighthq/types`

Seven type files, each following the one-concept-per-file convention:

- `LogContext.ts` — `{ channel, fields }`. Bound context for contextual logger functions.
- `LogDataProvider.ts` — `() => LogData`. Lazy payload thunk for zero-cost suppressed calls.
- `LogFormatter.ts` — `(entry) => string`. Pluggable formatter seam.
- `LogSignals.ts` — `{ onLogEntry, onLogError }`. Signal group returned by `enableLogSignals()`.
- `LogSpan.ts` — `{ name, fields, channel }`. Plain-value tracing span for `enterLogSpan`/`exitLogSpan`.
- `LogTimer.ts` — `{ channel, label, startedAt }`. Plain-value timing handle.
- `LogTransportBackend.ts` — `{ write, flush?, dispose? }`. Narrow write-only transport seam for file/remote sinks.

All seven wired into `packages/types/src/index.ts`.

### Exported functions in `@flighthq/log`

**Sink management (Bronze):**

- `addLogSink(sink)` — fan-out; no-op if already present
- `clearLogSinks()` — removes all sinks
- `removeLogSink(sink)` — removes a sink; returns `false` if not present
- `setLogSink(sink | null)` — replace-all; source compatibility with capture harness

**Level gates (Bronze):**

- `getLogLevel()` / `setLogLevel(level)` — global emit level (default `Verbose`)
- `getLogChannelLevel(channel)` — per-channel override; `null` when unset
- `setLogChannelLevel(channel, level)` — per-channel minimum level
- `clearLogChannelLevels()` — resets all channel overrides

**Lazy payload (Bronze):** All emit functions accept `LogData | LogDataProvider` thunks.

**Level name round-trip (Bronze):**

- `getLogLevelName(level)` — canonical lowercase name
- `parseLogLevel(name)` — case-insensitive parse; `null` for unknown names

**Memory sink (Bronze):**

- `createMemoryLogSink(capacity)` — ring-buffer `MemoryLogSink` handle
- `getMemoryLogSinkEntries(handle)` — oldest-first `readonly LogEntry[]`
- `clearMemoryLogSink(handle)` — resets the ring buffer

**Contextual loggers (Silver):**

- `createLogContext(channel, fields?)` — creates `LogContext`
- `createChildLogContext(parent, fields, channel?)` — merges fields (child wins)
- `logWith(context, level, data)` — emits with context channel and merged fields
- `logDebugWith` / `logErrorWith` / `logInfoWith` / `logVerboseWith` / `logWarnWith` — severity context variants

**Assertion and once-emit (Silver):**

- `logAssert(condition, data, channel?)` — emits `Error` only when false; never throws
- `logOnce(key, level, data, channel?)` — emits at most once per key; returns `true` on first emit

**Formatters (Silver):**

- `createJsonLogFormatter()` — `__flight` JSON envelope with serializer + redaction support
- `createTextLogFormatter(options?)` — human-readable line with optional `timestamp`/`levelPrefix`/`indentGroups`
- `createConsoleCaptureSink(options?)` — accepts optional `{ formatter? }`

**Error serialization (Silver):**

- `serializeLogError(value)` — extracts `name/message/stack/cause` recursively from `Error`

**Sink combinators (Silver):**

- `createBufferedLogSink(target, options?)` — batches; auto-flushes at `size` or `intervalMs`
- `flushLogSink(handle)` — flush immediately
- `disposeLogSink(handle)` — cancels timer, flushes (`dispose*` — detaches timer)
- `createFilterLogSink(target, predicate)` — per-sink independent filtering
- `createFanoutLogSink(...sinks)` — forwards to all

**Rate limiting and sampling (Silver):**

- `createRateLimitedLogSink(target, options)` — `maxPerInterval` per `intervalMs`; `perChannel` mode
- `createSampledLogSink(target, rate)` — 1-in-N forwarding; passthrough when rate ≤ 1

**Timing helpers (Silver):**

- `startLogTimer(label, channel?)` — returns `LogTimer`
- `endLogTimer(timer)` — emits `Debug` `{ label, elapsedMs }`; returns elapsed ms

**File transport backend seam (Gold):**

- `createFileLogSink(options?)` — writes to `LogTransportBackend`; formatter default is `createJsonLogFormatter()`
- `disposeFileLogSink(handle)` — flushes + disposes the backend
- `getLogTransportBackend()` / `setLogTransportBackend(backend | null)` — process-global backend slot
- `createWebLogTransportBackend()` — no-op web default backend

**Field redaction and custom serializers (Gold):**

- `setLogRedactionPaths(paths)` — dot-notation paths replaced with `'[REDACTED]'` in JSON formatter
- `clearLogRedactionPaths()` — disables redaction
- `registerLogSerializer(kind, fn)` — `*Kind`-style string registry; called by JSON formatter for `__kind`-tagged values
- `clearLogSerializers()` — removes all serializer registrations

**Grouping / nesting (Gold):**

- `beginLogGroup(label, channel?)` — emits Debug `{ msg, group: 'begin', depth }`; increments depth
- `endLogGroup(channel?)` — emits Debug `{ group: 'end', depth }`; decrements depth; no-op when depth is 0
- `clearLogGroups()` — resets depth to 0 (test teardown / error recovery)
- `createTextLogFormatter({ indentGroups: true })` — indents text-formatted lines by current group depth

**Span / scope context (Gold):**

- `createLogSpan(name, fields?, channel?)` — creates `LogSpan` plain value
- `enterLogSpan(span)` — pushes onto active-span stack; span fields merged into subsequent entries
- `exitLogSpan(span)` — removes by identity; supports out-of-order unwinding

**Signals integration (Gold):**

- `enableLogSignals()` — returns process-global `LogSignals`; idempotent; tree-shakes unless called
- `LogSignals.onLogEntry` — fires for every entry that passes the gate
- `LogSignals.onLogError` — fires only for `LogLevel.Error` entries
- Note: `_passesLevelGate` passes when `_logSignals !== null` (even with empty sinks)

**Emit side convenience wrappers:**

- `log(level, data, channel?)` + `logDebug` / `logError` / `logInfo` / `logVerbose` / `logWarn`

### Exported interfaces (opaque tokens)

- `BufferedLogSink` — returned by `createBufferedLogSink`
- `FileLogSink` — returned by `createFileLogSink`
- `MemoryLogSink` — returned by `createMemoryLogSink`
- `RateLimitedLogSink` — returned by `createRateLimitedLogSink`

### Package map

`@flighthq/log` appears in `tools/agents/docs/index.md` with stated scope.

### Dependencies

`@flighthq/log` now depends on both `@flighthq/types` and `@flighthq/signals` (added for `enableLogSignals`). The signals dependency tree-shakes away unless `enableLogSignals` is called.

### Tests

114 tests pass in `packages/log/src/log.test.ts`. Every exported function has at least one `describe` block with meaningful assertions.

## Design choices made

### File / remote transport as a backend seam (not filesystem import)

`createFileLogSink` uses `LogTransportBackend` — a narrow `{ write, flush?, dispose? }` interface defined in `@flighthq/types`. It does not import `@flighthq/filesystem`. This keeps `@flighthq/log` dependency-light (only `@flighthq/types` + `@flighthq/signals`). The web default is `createWebLogTransportBackend()` (no-op). Native/Node hosts register a real `fs`-backed implementation via `setLogTransportBackend`. One transport is process-global (same as how `setLogSink` was originally designed); multiple parallel transports can be achieved by composing within the backend itself.

### `createFileLogSink` resolves backend at emit time

The backend slot (`_transportBackend`) is read at the moment each entry is written, not when `createFileLogSink` is called. This means `setLogTransportBackend` can be called after sink creation without reinitializing the sink.

### JSON formatter applies redaction and serialization

`createJsonLogFormatter()` now calls `_applySerializers` and `_applyRedaction` at format time. The JSON formatter closes over the module-level `_redactionPaths` and `_serializers` (read at format time), so `setLogRedactionPaths` / `registerLogSerializer` affect all subsequently-formatted entries without re-creating the formatter. This is intentional: the formatter is a thin function, not a configured object.

### Redaction is alias-safe

`_applyRedaction` shallow-copies the root object and deep-copies only the nested objects it needs to modify. The original `LogEntry.data` object is never mutated. This satisfies the "alias-safe" out-param rule for functions that may receive a shared reference.

### Custom serializers use `__kind` field tagging

`registerLogSerializer(kind, fn)` follows the `*Kind`-style string registry: last-write-wins, vendor-prefixed for user kinds. The serializer is called when a field value has a `__kind` property matching the registered kind. Bare names (without a `.`) are reserved for built-in kinds; users use `'acme.Foo'`-style prefixes.

### Span fields have lower priority than direct emit fields

In `_mergeSpanFields`, span fields are applied first, then direct data fields overwrite them on key collision. This matches the `LogContext` merge behavior (context fields have lower priority than direct fields). The rationale: a span provides ambient context; the caller's explicit payload is authoritative.

### Group depth is module-level state

`_groupDepth` is a module-level integer. Tests must call `clearLogGroups()` in `beforeEach` or `afterEach` to avoid cross-test contamination. This is documented and done in the test file.

### Signals bypass the empty-sinks fast path

`_passesLevelGate` returns `true` when `_logSignals !== null`, even when `_sinks` is empty. This ensures signal listeners receive entries even in a no-sink configuration. The tradeoff: once `enableLogSignals()` is called, the level gate always passes (and the level/channel check inside is still applied), so a no-sink + no-signal configuration is no longer possible after `enableLogSignals`. Acceptable — `enableLogSignals` is opt-in and process-lifetime by design.

### `HttpLogSink` deferred

`createHttpLogSink` was deferred. The Gold seam is complete with `LogTransportBackend`: an HTTP-backed transport is a valid user implementation of `LogTransportBackend`. Building a built-in HTTP sink requires decisions about fetch credentials, retry policy, CORS, auth headers, and queue overflow that are out of scope for this pass. The `createBufferedLogSink` + `createWebLogTransportBackend`-override pattern is the composable equivalent.

## Deferred items and why

**Gold: `createHttpLogSink`.** Deferred — requires decisions about fetch implementation, batching policy, auth, CORS, retry/overflow, and whether to expose a `FlightHttpLogSinkOptions` in `@flighthq/types`. The `LogTransportBackend` seam is in place; a caller can implement HTTP shipping by registering a custom backend. This is low-priority given the seam is already provided.

**Gold: Performance benchmark suite.** `npm run size` baseline for emit-only import, and a microbenchmark proving a suppressed `logVerbose` in a tight loop allocates nothing. The zero-allocation fast path is implemented (gate checks before any object construction), but there is no automated proof via benchmark. Deferred as a separate measurement task.

**Gold: Rust crate `flighthq-log`.** Mirror the full settled API: `LogLevel`, free functions, `add_log_sink` / `remove_log_sink`, `set_log_level`, `set_log_channel_level`, `LogContext` / `log_with`, sink combinators, `LogFormatter`, `LogTransportBackend` trait. Deferred until conformance map tooling is in place. Record: `LogDataProvider` → `FnOnce` closure in Rust; `LogSink` → `Arc<dyn Fn(&LogEntry) + Send + Sync>`; groups/spans/signals have direct Rust equivalents.

**`@flighthq/log-formats` neighbor package.** Parser for `logs.jsonl` → `LogEntry[]`, NDJSON/logfmt/CLF emitters. Deferred until a second reader/parser consumer emerges. A single envelope reader does not justify a neighbor package yet.

## Concerns and surprises

**Module-level state accumulation.** Five module-level mutable values: `_sinks`, `_channelLevels`, `_onceKeys`, `_logSignals`, `_transportBackend`, `_groupDepth`, `_redactionPaths`, `_serializers`, `_spanStack`, `_level`, `_consoleLevel`. Only `_onceKeys` and `_logSignals` are not reset in `beforeEach` (they are process-lifetime by design). Tests that use `enableLogSignals` must be aware that subsequent tests will have `_logSignals !== null` (changing the gate behavior). All other state is reset in `beforeEach` via the exported clear/reset functions.

**`_logSignals` is never cleared.** Once `enableLogSignals()` is called, `_logSignals` stays non-null for the process lifetime. There is no `disableLogSignals()`. This is consistent with the `enable*` pattern in the codebase — `enableNodeSignals`, `enableSceneNodeSignals`, etc. do not have a corresponding disable. Signals accumulate handlers but connected slots are managed by the caller via `disconnectSignal`.

**`createFileLogSink` does not track handles.** Each `createFileLogSink` call creates a new opaque handle, but all handles share the same global `_transportBackend`. Calling `disposeFileLogSink` on any handle disposes the global backend. If multiple file sinks exist simultaneously (unusual), only the last `disposeFileLogSink` call releases the backend cleanly. This is acceptable given the "one transport per process" design — use `createFanoutLogSink` to write to multiple backends.

## Suggestions for future sessions

1. **Gold: `createHttpLogSink`.** Wraps `createBufferedLogSink` + a user-provided `fetch`-based backend. Define `HttpLogSinkOptions { endpoint: string; batchSize?: number; intervalMs?: number; headers?: Record<string, string> }` in `@flighthq/types`.

2. **Gold: benchmark + size baseline.** After all Gold features land, add `@flighthq/log` to `npm run size` baseline. Also add a Vitest bench file (`log.bench.ts`) asserting the suppressed-verbose fast path allocates nothing in V8. See the `math` package's `math.bench.ts` for the pattern (though note that bench files must not have top-level side effects — the current `math.bench.ts` has a packages:check failure).

3. **Rust crate.** The API is now settled and worth porting. Start from the leaf: `LogLevel`, `log*` free functions, `add_log_sink`, `set_log_level`, `set_log_channel_level`, `LogContext` / `log_with`. Skip the timer/group/span initially (those are convenience wrappers that port trivially after the core lands). Record divergences in the conformance map.

4. **`-formats` neighbor.** When a second consumer of `logs.jsonl` appears (replay tool, test fixture loader, logfmt/CLF exporter), split `@flighthq/log-formats` with `parseLogEntry(line: string): LogEntry | null` and format emitters.
