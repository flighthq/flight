---
package: '@flighthq/log'
status: solid
score: 76
updated: 2026-07-13
ingested:
  - live packages/log/src/log.ts (800 lines) + log.test.ts (114 tests, 61 describes)
  - live packages/types/src/Log.ts + LogSignals.ts
  - charter.md (2026-07-02 direction), assessment.md, status.md
  - prior review (2026-06-25 merge gate, score 40)
---

# log — Review (live-tree re-review, 2026-07-13)

## Verdict

**Solid, 76/100** — up from 40. The prior score reflected a build-blocking merge state (seven `@flighthq/types` imports undefined at the integration head), not the code's quality. That state is resolved in the live tree: `packages/types/src/Log.ts` now defines `LogContext`, `LogData`, `LogDataProvider`, `LogEntry`, `LogFormatter`, `LogLevel`, `LogSpan`, `LogTimer`, `LogTransportBackend`, and `LogSink`, and `packages/types/src/LogSignals.ts` defines `LogSignals`. Every import in `packages/log/src/log.ts:1-14` resolves. The recovery landed via `06a0c480` ("recover lost source across packages"); the three structural divider comments the prior review flagged were removed in `d730004a`. The charter's 2026-07-02 "false alarm" decision is confirmed against live source.

What ships is a genuinely comprehensive diagnostic logging library: 62 exports (58 functions + 4 opaque sink handle interfaces: `BufferedLogSink`, `FileLogSink`, `MemoryLogSink`, `RateLimitedLogSink`), one thin barrel, `"sideEffects": false`, 114 colocated tests with alphabetized describes mirroring exports. The codebase-map line ("leveled structured logging — log(level, data, channel?), severity wrappers, multi-sink fan-out (console/memory/file/buffered/rate-limited/sampled/filtered/fanout), text/JSON formatters, timing/spans, groups, assertions, redaction") is **accurate against source**, feature for feature — no longer aspirational.

The score lands at solid-mid rather than higher because three fidelity holes cut across otherwise-complete subsystems: entries carry no capture-time timestamp, redaction/serializers apply only inside one formatter rather than at emit, and the file-sink tier is a single global transport that cannot serve two destinations. None is a missing subsystem; each is a place where an existing subsystem doesn't fully deliver its own promise.

## AAA gap read (against a mature structured-logging library)

Present and verified in `packages/log/src/log.ts`:

- **Leveled core + channels** — `log`/`logDebug`/`logInfo`/`logWarn`/`logError`/`logVerbose`, `LogLevel` gate, per-channel overrides (`setLogChannelLevel`/`getLogChannelLevel`/`clearLogChannelLevels`), lazy `LogDataProvider` thunks invoked only past the gate (`log.ts:402-408` — suppressed verbose emits allocate nothing).
- **Scoped/child loggers with bound fields** — `createLogContext`/`createChildLogContext` (field merge + channel inheritance, `log.ts:114-126`) with the full `logWith`/`log*With` wrapper family. This is the child-logger capability of pino/bunyan, delivered as plain data + free functions.
- **Sink fan-out + combinators** — `addLogSink`/`removeLogSink`/`setLogSink`/`clearLogSinks`; console-capture, memory (ring buffer with capacity), file (via transport), buffered (interval auto-flush + `flushLogSink`/`disposeLogSink`), rate-limited (windowed, optional per-channel budget), sampled, filtered, fanout. All eight sink types from the map exist.
- **Formatters** — `createTextLogFormatter` (timestamp/levelPrefix/indentGroups options), `createJsonLogFormatter`, plus the internal `_defaultJsonFormatter` envelope for the capture harness.
- **Spans/timing/groups** — `createLogSpan`/`enterLogSpan`/`exitLogSpan` (field-merging span stack, out-of-order unwind supported), `startLogTimer`/`endLogTimer` (emits elapsed-ms Debug entry), `beginLogGroup`/`endLogGroup` (depth-tracked).
- **Sampling, rate limiting, redaction, assertions, once-logging** — `createSampledLogSink`, `createRateLimitedLogSink`, `setLogRedactionPaths` (dot-notation, copy-before-mutate in `_redactPath`), `logAssert` (never throws), `logOnce`.
- **Crash-report buffering** — `createMemoryLogSink(capacity)` ring buffer + `getMemoryLogSinkEntries` (oldest-first) is the right primitive; see the timestamp gap below for the caveat.
- **Persistence seam** — `LogTransportBackend` (`write`/`flush?`/`dispose?`) with `createWebLogTransportBackend` as the honest no-op web default and `setLogTransportBackend` for native hosts. Rotation correctly lives behind the seam, not in the SDK.
- **Serializer registry** — `registerLogSerializer(kind, fn)` keyed on `__kind` strings, last-write-wins. Correct open-registry fork shape.
- **Signals** — `enableLogSignals` → `LogSignals` (`onLogEntry`, `onLogError`), inert until enabled; `_passesLevelGate` short-circuits when no sinks and no signals, so an unconfigured build does no work.

Deliberately out of scope per charter (confirmed non-goals, not gaps): distributed tracing / correlation IDs / request-context propagation; log shipping to external services (composable via sinks/transport).

### Gap 1 — no capture-time timestamp on `LogEntry` (the biggest one)

`LogEntry` is `{ level, channel, data }` (`packages/types/src/Log.ts:60-64`). Timestamps are stamped at **format** time — `createTextLogFormatter` and `_defaultJsonFormatter` call `_timestamp()` when rendering (`log.ts:262`, `log.ts:778`) — not at emit time. Consequences:

- Any deferred-formatting path records the wrong moment: a `createBufferedLogSink` that formats on flush stamps flush time; entries replayed from `createMemoryLogSink` have no time at all — a crash-report ring buffer cannot order or timeline its entries, which is half the point of a crash buffer.
- Two sinks formatting the same entry print different timestamps.

A mature structured logger stamps at capture. The fix is one field on `LogEntry` written at emit (the wrappers already share the gate/emit shape) and formatters reading `entry.t` instead of calling `_timestamp()`. Within-package plus one types-file field; flagged as the top recommended item (the `@flighthq/types` edit is the established header-first workflow, not a design fork).

### Gap 2 — redaction and serializers apply only inside `createJsonLogFormatter`

`_applySerializers`/`_applyRedaction` are invoked exactly once, in `createJsonLogFormatter` (`log.ts:170-171`). They are **not** applied at emit, so:

- Raw, unredacted entries fan out to every sink (`_emitToSinks`, `log.ts:735-741`), to `LogSignals` listeners, to `createMemoryLogSink` buffers, and through `createConsoleCaptureSink`'s `_defaultJsonFormatter` — which skips redaction entirely (`log.ts:774-782`).
- `createTextLogFormatter` also skips both, so the human console line prints the secret the JSON line would have redacted.

`setLogRedactionPaths` reads as a privacy feature ("keep this out of the logs") but only holds for one formatter. Either apply redaction+serializers once at emit (before `_emitToSinks`), or document the feature as JSON-formatter-scoped. Applying at emit is the honest fix and removes per-formatter duplication; within-package and sweep-safe.

### Gap 3 — single global transport; file-sink handles are vestigial

All `createFileLogSink` handles share the one module-global `_transportBackend`. `disposeFileLogSink(_handle)` **ignores its handle parameter** and flushes/disposes the global backend (`log.ts:290-296`). Two file sinks cannot write to two destinations, and disposing "one" disposes the shared transport for all. Either the transport moves onto the `FileLogSink` handle (`createFileLogSink(options: { transport?, formatter? })` falling back to the global), or the API should stop pretending handles are independent. Per-sink transport is the mature shape and keeps the global as default; recommended.

### Smaller observations

- **Monolith** — 800 lines, 62 exports, one file. Charter Decision #2 (decompose into logCore/logSink/logFormat/logTiming) was parked on "needs compiled package first"; that precondition is now met, so the decomposition is unblocked (still Backlog: it's a file-layout design pass, not a mechanical sweep).
- **Global singleton state** — levels, sinks, spans, groups, channels are module globals; there are no logger instances. Consistent with the "SDK diagnostic layer" north star and the C-portability posture (contexts serve the child-logger role), but two libraries in one page share one logger. Not raised as a gap; it is the charter's chosen shape.
- **Types layout** — the Log types live in one `Log.ts` rather than one-concept-per-file (`LogSignals` is separate). Deviation from [types-layout](../../conventions/types-layout.md); cross-package (types cell), noted here only.
- **`exitLogSpan` emits nothing** — spans are field-scopes, not timers; duration lives in `startLogTimer`/`endLogTimer`. Coherent split, no action.
- **Diagnostics inversion** — `log` *is* the emission substrate, and `@flighthq/debug` (see `d2fc920a`) now builds gated timing spans/frame markers over it. No `explain*`/guard gaps identified within `log` itself.

## Standards summary

- **Naming (pass)** — full unabbreviated names throughout; `create*`/`get*`/`set*`/`dispose*` discipline holds (`disposeLogSink`/`disposeFileLogSink` correctly `dispose*`, not `destroy*` — timers/GC release, no native handles).
- **Tree-shaking (pass)** — thin barrel, `"sideEffects": false`, no top-level side effects; emit side and listener side documented as two tree-shakable faces (`log.ts:16-27`).
- **Registry vs union (pass)** — serializer registry is string-keyed, last-write-wins.
- **Sentinels (pass)** — `parseLogLevel`→`null`, `removeLogSink`→`false`, `getLogChannelLevel`→`null`, `logAssert` never throws.
- **Tests (pass)** — 61 alphabetized describes mirroring exports; 114 tests. Copy-before-mutate covered for redaction.

## Admin-doc drift noted (not edited here)

- `charter.md` "What it is" says 61 exports; live is 62 (58 functions + 4 interfaces). Trivial.
- The codebase-map Package Map line for `log` is now accurate — the prior assessment's "Package Map description update" item is satisfied.
