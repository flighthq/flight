---
package: '@flighthq/log'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/log.md
  - source
---

# log — Review

## Verdict

`solid` — 86/100. Over one builder pass `@flighthq/log` moved from a deliberately-narrow capture-harness seam (prior depth review: `partial`, 48/100) to a broad, idiomatic, mostly-AAA logging library: 61 exported functions, 4 opaque sink tokens, 7 new `@flighthq/types` files, 114 tests. Every top-tier gap the depth review named (multi-sink fan-out, per-channel + global level gates, lazy payloads, contextual loggers, pluggable formatters, built-in sinks, rate limiting/sampling, timing, grouping, spans, signals, level name round-trip) is now closed. What keeps it short of `authoritative` is not missing surface area but a stub charter (no blessed North star or boundaries to certify against), one stale doc comment, a deferred HTTP sink, no `npm run size`/bench proof of the headline tree-shake-to-nothing claim, and no Rust crate yet.

The status doc (`builder-67dc46d64`, as-claimed) is accurate. Spot-checks against the diff confirm: 114 `it` blocks, 61 `export function`, the `@flighthq/signals` dependency add in `package.json`, exported functions and interfaces alphabetized, `sideEffects: false`, single root `.` export via `index.ts` → `./log`. The one omission in the status doc's API list — `getLogConsoleLevel` / `setLogConsoleLevel` — exists in source and is fine; the doc simply did not re-list the pre-existing console-threshold pair.

## Present capabilities

Grounded in `67dc46d64:packages/log/src/log.ts` and `packages/types/src/Log*.ts`.

**Emit side (tree-shakable forwarders).** `log(level, data, channel?)` plus `logError/Warn/Info/ Debug/Verbose`, the context variants `logErrorWith`/… over `LogContext`, `logWith`, `logAssert` (emits `Error` only when the condition is false, never throws — sentinel-correct), and `logOnce(key, …)` (emits at most once per key, returns `true` on first emit). Every emit accepts `LogData | LogDataProvider`; the thunk is invoked only after `_passesLevelGate`, so a suppressed `logVerbose` allocates nothing — the depth review's "no-op verbose still allocates" gap is closed.

**Level model.** `LogLevel` (None=0…Verbose=5) in `@flighthq/types`. Global gate (`get/setLogLevel`, default `Verbose`), per-channel override (`get/setLogChannelLevel`, `clearLogChannelLevels`, `null` sentinel when unset), and the pre-existing console-print threshold (`get/setLogConsoleLevel`). Name round-trip: `getLogLevelName` / `parseLogLevel` (case-insensitive, `null` for unknown) — closes the depth review's missing-export gap.

**Sink management + combinators.** `addLogSink` (no-op if present) / `removeLogSink` (returns `false` if absent) / `clearLogSinks`, plus `setLogSink(sink|null)` kept for capture-harness compatibility. Combinators: `createFanoutLogSink`, `createFilterLogSink`, `createBufferedLogSink` (+`flushLogSink`, `disposeLogSink` — `dispose*` correctly chosen because it detaches the interval timer, not frees a non-GC resource), `createRateLimitedLogSink` (per-interval budget, optional `perChannel`), `createSampledLogSink` (1-in-N, identity passthrough when `rate ≤ 1`), `createMemoryLogSink` ring-buffer (+`getMemoryLogSinkEntries` oldest-first, `clearMemoryLogSink`), and the `createConsoleCaptureSink` that drives the Playwright `logs.jsonl` harness.

**Formatters + serialization.** `createJsonLogFormatter` (the `__flight` envelope, applies redaction

- custom serializers at format time), `createTextLogFormatter` (`timestamp`/`levelPrefix`/ `indentGroups` options), `serializeLogError` (recursive `name/message/stack/cause`), field redaction (`set/clearLogRedactionPaths`, dot-notation, alias-safe shallow-copy in `_applyRedaction`), and a `__kind`-tagged serializer registry (`registerLogSerializer`/`clearLogSerializers`).

**Transport seam.** `createFileLogSink` writes formatted lines to a `LogTransportBackend` (`{ write, flush?, dispose? }` in `@flighthq/types`), resolved at emit time so `setLogTransportBackend` may follow sink creation; `getLogTransportBackend`, `createWebLogTransportBackend` (no-op web default), `disposeFileLogSink` (flush + dispose). The seam deliberately does **not** import `@flighthq/filesystem`, keeping deps to `types` + `signals`.

**Tracing conveniences.** Timers (`startLogTimer`/`endLogTimer` → Debug `{label, elapsedMs}`), groups (`beginLogGroup`/`endLogGroup`/`clearLogGroups`, depth merged into entries and indented by the text formatter), spans (`createLogSpan`/`enterLogSpan`/`exitLogSpan`, stack-based, identity removal supporting out-of-order unwind, span fields lower-priority than direct fields), and contextual loggers (`createLogContext`/`createChildLogContext`, child-wins merge).

**Signals.** `enableLogSignals()` returns a process-global `LogSignals { onLogEntry, onLogError }`; idempotent, tree-shakes unless called, emits synchronously in `_emitToSinks`.

## Gaps

Measured against mature loggers (pino/winston/Serilog/Rust `tracing`) and the AAA bar:

- **HTTP/remote sink deferred.** `createHttpLogSink` is not built; the status doc argues the `LogTransportBackend` seam + `createBufferedLogSink` is the composable equivalent. Reasonable, but the canonical batched-POST-with-retry sink is a thing mature libraries ship. (See the stale comment below — the deferral left an orphaned docstring.)
- **No size/allocation proof.** The headline claim — emit-only import carries "only the gate check and the `LogLevel` enum," and a suppressed `logVerbose` allocates nothing — is implemented but unmeasured. No `npm run size` baseline entry for log, no `log.bench.ts`. The claim is plausible from the gate-before-construct structure but is currently assertion-by-inspection.
- **No Rust crate.** `flighthq-log` does not exist; charter front matter declares `crate: flighthq-log`, so the conformance mirror is owed. Status records the intended mapping (`LogDataProvider`→`FnOnce`, `LogSink`→`Arc<dyn Fn + Send + Sync>`).
- **`_logSignals` is one-way.** No `disableLogSignals`. Consistent with the `enable*` family (none disable), and once enabled the empty-sinks fast path in `_passesLevelGate` is bypassed for the process lifetime — a deliberate, documented tradeoff, but a sharp edge for a long-lived host that enables signals then wants the zero-cost path back.
- **File-sink handles share one global backend.** `createFileLogSink` returns distinct handles but all write to the single `_transportBackend`; `disposeFileLogSink(anyHandle)` disposes the shared backend. Acceptable under the stated "one transport per process" design, but the per-handle token implies per-handle ownership it does not have.
- **`-formats` neighbor deferred.** No `parseLogEntry`/NDJSON/logfmt/CLF reader for `logs.jsonl`. Correctly parked until a second consumer appears (the triad plurality guard agrees).

## Charter contradictions

None — the charter's North star, Boundaries, and Decisions are all `TODO`, so there is nothing to contradict. The package's actual shape is consistent with the codebase-map AAA standard and the house design constraints (see below). The absence of contradictions here is a symptom of the stub charter, not of certified alignment: every "is this in scope?" question is currently unanswered (see Candidate open directions).

## Contract & docs fit

**Lives up to the contract:**

- **Types-first.** All cross-package shapes (`LogLevel`, `LogData`, `LogEntry`, `LogSink`, `LogContext`, `LogDataProvider`, `LogFormatter`, `LogSignals`, `LogSpan`, `LogTimer`, `LogTransportBackend`) live in `@flighthq/types`, one concept per file, wired into the barrel. The four `*LogSink` opaque tokens are implementation handles and correctly stay local to `log.ts`.
- **Naming.** Full unabbreviated `Log` type word in every export; `get*`/`set*`/`create*`/`is*`-free prefixes used correctly; severity wrappers mirror `console.*`. `dispose*` vs `destroy*` chosen correctly (timer/backend detach → `dispose`, no non-GC resource → no `destroy`). Sentinels not throws (`parseLogLevel`→`null`, `removeLogSink`→`false`, `logAssert` never throws).
- **Side-effect-free / single export.** `sideEffects: false`; module-level state is initialized but no listeners/timers/registration run at import; single root `.` export. `enableLogSignals` and sink installation are opt-in.
- **Structural fork B (registry over closed union).** `registerLogSerializer` is a `*Kind`-style string registry (last-write-wins, vendor-prefixed user kinds, bare names reserved) — the registry-by-default default, correctly applied. No closed `switch(kind)` in a hot path; the emit gate short-circuits before any dispatch.
- **Structural fork C (no config-gated hot function).** `updateParticleEmitter`-style smell is absent: the emit path is a flat gate→resolve→merge→fan-out with no feature branches inside a loop. The 12 near-identical `log*`/`log*With` bodies are duplicated rather than delegated, which is the deliberate tree-shake/inline tradeoff, not a bundled-features hot function.

**Candidate revisions to the contract / admin docs:**

- **Package Map line is now present and accurate** (the depth review flagged it missing). The `@flighthq/log` entry in `tools/agents/docs/index.md` matches the built shape. No revision needed — record that the prior depth-review finding is resolved.
- **Stale doc comment (source bug, not a contract issue but worth flagging).** The docstring on `createWebLogTransportBackend` (`67dc46d64:packages/log/src/log.ts:276-281`) describes `createHttpLogSink` ("ships entries to a remote HTTP endpoint via batched POST … flushed when the batch reaches `batchSize`…") — a leftover from the deferred HTTP sink. The function it sits on is the no-op web backend. `LogTransportBackend.ts` in types likewise references `createHttpLogSink`, which does not exist. Both should be corrected to describe what shipped.

## Candidate open directions

The charter is a stub; each item below is a question a reviewer had to assume an answer to, and a candidate for the charter's Open directions:

1. **Scope ceiling — seam or library?** The depth review framed log as a deliberately narrow capture seam; this pass grew it into a full logger. Is full-library breadth (HTTP shipping, sampling, spans) the blessed target, or is some of this beyond the SDK's intended logging role? The charter should state the boundary so future passes know whether `createHttpLogSink` is owed or out of scope.
2. **Process-global state as the model.** Eleven module-level mutable values (sinks, levels, redaction paths, serializers, span stack, group depth, signals, transport). This matches the platform-suite ambient-backend pattern and forecloses multiple independent loggers. Is single-process-global the blessed design, or is a future per-logger handle in scope?
3. **`enableLogSignals` irreversibility.** Should there be a `disableLogSignals` (and restoration of the empty-sinks fast path), or is enable-once-for-process-lifetime the rule, consistent with the rest of the `enable*` family?
4. **Tracing-stack ambition.** Spans/groups/timers were built to the Rust `tracing` model. Is log the home for tracing, or is that a future `tracing`/`telemetry` neighbor and log should stay logging?
5. **`-formats` split trigger.** Confirm the plurality-guard call: `@flighthq/log-formats` (`parseLogEntry`, NDJSON/logfmt/CLF) waits for a second `logs.jsonl` consumer. Is that the agreed bar?
6. **Size/bench gate as a Decision.** Should the zero-allocation-suppressed-emit and emit-only-import claims be promoted from prose to an enforced `npm run size` baseline + `log.bench.ts` gate (the bundle-discipline rule applied to this package)?
