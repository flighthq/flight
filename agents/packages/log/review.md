---
package: '@flighthq/log'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# log — Review

## Verdict

**solid — 78/100.** A complete, well-tested diagnostic logging surface with composable sinks, structured output, and a clean type story. The single-file monolith is the main structural gap; the runtime API and type contracts are mature.

## Present capabilities

All 61 exported functions live in one file (`src/log.ts`, 826 lines) with one colocated test file (`src/log.test.ts`, 1634 lines, 139 test cases across 62 `describe` blocks). `contract.ts` re-exports `log.ts`; `index.ts` selectively re-exports the public lane with an explicit named list. Every exported function has a corresponding `describe` block and the blocks are alphabetized, matching source order.

### Core emit path

- `log(level, data, channel?)` with severity wrappers: `logDebug`, `logError`, `logInfo`, `logVerbose`, `logWarn` — each with a `*With(context, data)` variant.
- `LogDataProvider` thunk support — the thunk is not called when the level gate suppresses, verified by test (`severity wrapper providers and gates`).
- `logOnce(key, level, data, channel)` — once-per-process semantics with `clearLogOnceKeys` for test teardown.
- `logAssert(condition, data, channel)` — sentinel-style (emits Error, never throws).
- `logWith(context, level, data)` — context-bound emit with field merging.

### Sink pipeline (composable)

- **Console**: `createConsoleCaptureSink` (dual-face: tagged JSON envelope on `console.debug` for capture harness + human-readable line for levels at/above console threshold), `createConsoleLogSink`.
- **Memory**: `createMemoryLogSink(capacity)` — ring buffer, `getMemoryLogSinkEntries`, `clearMemoryLogSink`.
- **File**: `createFileLogSink(transport, options)` — Entity handle with exclusively owned `LogTransport`, synchronous FIFO admission, awaited `destroyFileLogSink` with composite flush/destroy outcomes.
- **Combinators**: `createBufferedLogSink` (size + interval auto-flush, `flushLogSink`, `disposeLogSink`), `createFilterLogSink`, `createFanoutLogSink`, `createRateLimitedLogSink` (per-channel tracking), `createSampledLogSink` (1-in-N).
- Management: `addLogSink`, `removeLogSink`, `setLogSink`, `clearLogSinks`.

### Formatters

- `createJsonLogFormatter` — `__flight` JSON envelope with timestamp, level name, channel, data. Applies serializers and redaction.
- `createTextLogFormatter` — human-readable `[channel] message` with optional timestamp, level prefix, and group indentation.

### Level gating

- Global: `setLogLevel` / `getLogLevel` (default `Verbose`).
- Per-channel: `setLogChannelLevel` / `getLogChannelLevel` / `clearLogChannelLevel` / `clearLogChannelLevels`.
- Console threshold: `setLogConsoleLevel` / `getLogConsoleLevel` (default `Info`).
- `parseLogLevel` / `getLogLevelName` — bidirectional name-to-enum, sentinel on unknown.

### Timing, spans, groups

- `startLogTimer` / `endLogTimer` — plain `LogTimer` value, emits structured Debug entry with elapsed.
- `createLogSpan` / `enterLogSpan` / `exitLogSpan` — stack-based field merging, identity-based removal supports out-of-order exit.
- `beginLogGroup` / `endLogGroup` / `clearLogGroups` — nesting depth tracked even when suppressed.

### Context, serialization, redaction

- `createLogContext` / `createChildLogContext` — channel + fields, child-wins merge.
- `registerLogSerializer` / `clearLogSerializers` — `__kind`-dispatched custom serializers.
- `setLogRedactionPaths` / `clearLogRedactionPaths` — dot-notation field redaction, alias-safe (original data not mutated).
- `serializeLogError` — recursive Error-to-record extraction with cause chain.

### Signals

- `enableLogSignals` — lazy singleton `LogSignals` entity with `onLogEntry` and `onLogError` signals via `@flighthq/signals`.

### Type home

All types are in `@flighthq/types`: `Log.ts` (LogLevel, LogData, LogContext, LogDataProvider, LogFormatter, LogSpan, LogTimer, LogEntry, LogSink, LogTransport, LogTransportWriteOutcome, LogTransportFlushOutcome, LogTransportDestroyOutcome, LogTransportDeliveryBoundary), `BufferedLogSink.ts`, `FileLogSink.ts` (FileLogSink, FileLogSinkDestroyOutcome), `MemoryLogSink.ts`, `RateLimitedLogSink.ts`, `LogSignals.ts`. This is correct per the types-first convention.

### Package shape

- `sideEffects: false` declared.
- Two-lane exports: `.` (index.ts, selective named re-export) and `./contract` (contract.ts, `export *`).
- Dependencies: `@flighthq/signals` and `@flighthq/types` only.
- tsconfig references match: `signals` and `types`.
- No top-level side effects — all sinks registered via explicit function calls.
- 130 files across the SDK import from `@flighthq/log`, confirming its role as the foundational diagnostic layer.

## Gaps

### Structural

1. **Single-file monolith.** All 61 exports in one 826-line `log.ts`. The charter explicitly calls this out (Decision: "The 61-export single file should decompose") and the status confirms it is still the case. Natural decomposition candidates: core engine (log, severity wrappers, level gating), sinks (console, memory, file, combinators), formatters (JSON, text), timing/spans/groups. This is the package's primary structural weakness.

2. **No allocation benchmark.** Status notes the suppressed-`logVerbose` fast path gates before constructing anything, but nothing proves it. No `log.bench.ts` exists. For a hot-path package consumed by 130+ files, the performance claim is unverified.

### Behavioral

3. **`enableLogSignals` is one-way.** Once called, `_logSignals` is non-null for the process lifetime. `_passesLevelGate` returns early only when `_sinks.length === 0 && _logSignals === null`, so once enabled, a zero-sink configuration no longer takes the fast path. No `disableLogSignals` exists. Tests that call it contaminate all subsequent tests in the file (mitigated today by the test file's structure, but fragile).

4. **`_onceKeys` has no process-level reset beyond `clearLogOnceKeys`.** The `clearLogOnceKeys` function exists and is tested, but `_onceKeys` is not cleared by `beforeEach` in the test file (it is, actually, on line 108). Confirmed: the test file does clear it in `beforeEach`. This is correct.

5. **`_spanStack` has no bulk clear.** Unlike groups (`clearLogGroups`), channels (`clearLogChannelLevels`), and once-keys (`clearLogOnceKeys`), there is no `clearLogSpans` function. Tests handle cleanup manually via `exitLogSpan` in `afterEach`. A missing reset function is a minor gap for test ergonomics.

### Domain completeness

6. **No HTTP/network sink.** Deliberately deferred per status ("No `createHttpLogSink`"), and the composition path (`LogTransport` + `createBufferedLogSink`) covers it. Not a gap in the charter's scope, but worth noting as the one sink type a production deployment would want that is not built-in.

7. **No logfmt formatter.** The charter lists "text, JSON" as the formatter scope, which is satisfied. Logfmt is a common third format for structured logging but is not in scope per the charter.

## Charter contradictions

**None found.** The source aligns with all stated North-star principles and Boundaries:

- The charter says "SDK diagnostic layer" and "composable sinks" — the implementation delivers both. Sinks are plain functions composed via filter/buffer/fanout/rate-limit/sample combinators.
- The charter says "near scope ceiling" — 61 exports is comprehensive for a graphics SDK logger, and the status explicitly defers HTTP and logfmt as out-of-scope-for-now.
- The Decision to decompose the single file has not been executed, but neither does the charter state a deadline — it is a recorded direction, not a violated constraint.
- The Decision to remove structural divider comments has been executed: no `// ----` style comments remain in the source.
- The file transport Decision (zero-provider explicit dependencies) is fully realized: `LogTransport` is an injected, owned Entity; no Host slot, ambient provider, or global state.

## Contract and docs fit

### Package to contract

- **Types in `@flighthq/types`**: All exported types live in types. The implementation package exports functions only. Correct.
- **Full unabbreviated names**: All function names include their full type name (`createBufferedLogSink`, `getLogChannelLevel`, `serializeLogError`). Correct.
- **Sentinel-not-throw**: `parseLogLevel` returns null, `removeLogSink` returns false, `logAssert` emits rather than throws. The one `throw` is in `destroyFileLogSink` for an unknown handle — a programmer-error precondition, which is the correct use per the constraint ("Throw only for programmer errors"). Correct.
- **`sideEffects: false`**: Declared and accurate — no top-level registration.
- **Two export lanes**: `.` and `./contract`. Correct.
- **`Readonly<T>` usage**: Function parameters consistently use `Readonly<LogEntry>`, `Readonly<LogContext>`, `Readonly<LogSpan>`, `readonly string[]`. Correct.
- **`import type` on own line**: The source uses `import type { ... }` on its own line, separate from value imports. Correct.
- **Exported functions alphabetized**: Verified — all 61 exports appear in alphabetical order. Correct.
- **Test `describe` blocks alphabetized**: 62 blocks (61 per-function + 1 aggregate "severity wrapper providers and gates") are in alphabetical order and mirror exported names. Correct.
- **Module-level state at bottom**: All private `const`/`let` declarations and helper functions appear after the exported functions. Correct.
- **No structural divider comments**: None found. Correct.
- **No inline TODO comments**: None found. Correct.
- **`dispose*` vs `destroy*` distinction**: `disposeLogSink` detaches the interval timer for a `BufferedLogSink` (GC-release), while `destroyFileLogSink` tears down the transport resource (non-GC resource). Correct per convention.

### Candidate contract/docs revisions

- **Package Map entry**: The AGENTS.md Package Map lists `log` in the Application domain. The charter says the map entry should be expanded, but the current one-word listing is consistent with other packages in the map. This is an Open direction in the charter, not a contract violation.

## Candidate open directions

1. **Decomposition execution.** The charter records the decision but does not prescribe the file split. The Open direction ("Which files does log.ts split into?") remains open. A reviewer's observation: the natural boundaries visible in the source are (a) core emit path + level gating (~lines 37-616), (b) sink types and combinators (interspersed with core), (c) formatters (~lines 194-297), (d) timing/spans/groups (~lines 340-376, 360-410). The interleaving of sinks with core makes a clean cut non-trivial without also reordering.

2. **`enableLogSignals` reversibility.** Whether `disableLogSignals` should exist. The one-way design is intentional (once enabled, the signal infrastructure stays live), but it prevents the zero-sink fast path from re-engaging. The charter is silent on this.

3. **Span stack bulk clear.** Whether a `clearLogSpans` (parallel to `clearLogGroups`, `clearLogOnceKeys`, etc.) should exist for test ergonomics and error recovery.

4. **Module-level mutable state count.** Ten module-level mutable values power the process-global logging state. This is inherent to a global logger design but contrasts with the codebase-map constraint "no module-scoped mutable state that functions reach for." The charter is silent on whether log is an acknowledged exception to the explicit-dependency model or whether the state should be restructured (e.g., into an explicit `LogState` object passed by callers). This is a design question, not a defect — the global logger pattern is the industry norm.
