---
package: '@flighthq/log'
crate: flighthq-log
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# log — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Application/SDK logging — leveled, structured, capture-aware diagnostic logging. `log(level, data, channel?)` and its severity wrappers forward a `LogEntry` to a set of installed sinks, gated first by a global + per-channel level model. It is both the SDK's general-purpose logger and the capture seam that drives the Playwright `logs.jsonl` harness (`createConsoleCaptureSink`).

Where it ends vs. neighbors: `log` owns the emit path, the level model, sinks and their combinators, formatters/serialization, and tracing conveniences (timers/groups/spans/contextual loggers). It does **not** own the file-write substrate — that crosses the `LogTransportBackend` seam in `@flighthq/types`, deliberately not importing `@flighthq/filesystem`. Reading `logs.jsonl` back (`parseLogEntry`/NDJSON/logfmt) is a parked `@flighthq/log-formats` neighbor, not part of this package. Its only runtime dependencies are `@flighthq/types` and `@flighthq/signals`.

_(Identity drawn from review.md; replace with your own framing when you bless it.)_

## North star (proposed)

_Proposed durable principles, inferred from the design + the SDK forks. Edit or reject; nothing here is blessed._

- **Emit-only import stays near-zero.** A consumer that only calls `logVerbose`/`logError` pays for the level gate and the `LogLevel` enum, nothing more. The gate runs _before_ payload construction, so a suppressed emit allocates nothing — `LogData | LogDataProvider` thunks are invoked only past the gate. Tree-shaking, sink combinators, formatters, and tracing must never tax the bare emit path. (This is the bundle-discipline rule applied here; whether it is _enforced_ via `npm run size` is an open direction.)
- **Side-effect-free and opt-in.** `sideEffects: false`; no sink, listener, or timer runs at import. Sinks are installed explicitly, signals are opt-in via `enableLogSignals`, and the transport backend is resolved at emit time so it can be set after sink creation.
- **Sentinels, not throws.** `logAssert` never throws, `parseLogLevel`→`null`, `removeLogSink`→ `false`. Logging is diagnostic infrastructure and must never become a failure source for the code it observes.
- **Registry over closed union (fork B).** Custom serializers register against a `__kind` string registry (last-write-wins, vendor-prefixed user kinds), not a closed `switch`. The emit gate short-circuits before any dispatch, keeping the hot path branch-free.
- **Types-first.** Every cross-package shape (`LogLevel`, `LogEntry`, `LogSink`, `LogContext`, `LogFormatter`, `LogSignals`, `LogSpan`, `LogTimer`, `LogTransportBackend`, …) lives in `@flighthq/types`, one concept per file; only the opaque `*LogSink` handle tokens stay local.

## Boundaries (proposed)

_Proposed scope lines from the review and neighbors. Confirm, tighten, or reject._

**In scope (as built):** the level model (global + per-channel + console threshold), multi-sink fan-out and the sink combinators (filter/buffer/rate-limit/sample/memory-ring/fanout), formatters (JSON `__flight` envelope, text), error serialization, field redaction, the custom-serializer registry, the file/transport seam over `LogTransportBackend`, tracing conveniences (timers/groups/spans/contextual + child loggers), and the console-capture sink for the test harness.

**Open / undecided (see Open directions):** HTTP/remote shipping sink, per-logger handles vs. process-global state, `disableLogSignals`, whether the tracing stack belongs here or in a future `telemetry`/`tracing` neighbor, the `-formats` reader split, and the Rust `flighthq-log` crate.

**Out of scope:** the file-write substrate itself (lives behind the backend seam, not via a `@flighthq/filesystem` import); reading/parsing log streams back into entries (parked `@flighthq/log-formats`).

## Decisions

None blessed yet.

## Open directions

_The real questions — every candidate the review surfaced, plus the structural forks that touch this package. An agent asks here rather than assuming._

1. **Scope ceiling — narrow seam or full library?** The prior depth review framed `log` as a deliberately narrow capture seam; this builder pass grew it into a full logger (HTTP-class shipping, sampling, spans, contextual loggers). Is full-library breadth the blessed target, or is some of it beyond the SDK's intended logging role? The answer decides whether `createHttpLogSink` is owed or out of scope.

2. **HTTP/remote sink — build or stay composed?** `createHttpLogSink` is deferred; the status doc argues `LogTransportBackend` + `createBufferedLogSink` is the composable equivalent. Mature loggers (pino/winston/Serilog) ship a canonical batched-POST-with-retry sink. Build it, or bless the composed equivalent and remove the orphaned docstring/`types` reference that still names it?

3. **Process-global state as the model.** Eleven module-level mutable values (sinks, levels, redaction paths, serializers, span stack, group depth, signals, transport) match the platform-suite ambient-backend pattern but foreclose multiple independent loggers. Is single-process-global the blessed design, or is a per-logger handle in scope? (Structural fork: the ambient-backend vs. handle question.)

4. **`enableLogSignals` irreversibility.** No `disableLogSignals`; once enabled, the empty-sinks fast path in the gate is bypassed for the process lifetime. Consistent with the `enable*` family (none disable). Is enable-once the rule, or should a long-lived host be able to reclaim the zero-cost path?

5. **Tracing-stack ambition.** Spans/groups/timers were built to the Rust `tracing` model. Is `log` the home for tracing, or is that a future `tracing`/`telemetry` neighbor, with `log` staying logging? (Fork: where bedrock lies between logging and tracing.)

6. **`-formats` split trigger (fork B / triad plurality guard).** `@flighthq/log-formats` (`parseLogEntry`, NDJSON/logfmt/CLF) is parked until a second `logs.jsonl` consumer appears. The review and the plurality guard agree — confirm that is the bar.

7. **Size/bench gate as a Decision (fork: bundle discipline).** Should the zero-allocation-suppressed-emit and emit-only-import claims be promoted from prose to an enforced `npm run size` baseline + `log.bench.ts` gate, rather than assertion-by-inspection?

8. **Rust crate (`flighthq-log`) conformance.** Front matter declares `crate: flighthq-log`, but the crate does not exist. Status records the intended mapping (`LogDataProvider`→`FnOnce`, `LogSink`→`Arc<dyn Fn + Send + Sync>`). Is the conformance mirror owed now, or deferred until the TS scope ceiling (direction 1) settles?

9. **File-sink handle ownership.** `createFileLogSink` returns distinct handles, but all write to the single shared `_transportBackend`, and `disposeFileLogSink(anyHandle)` disposes the shared backend. Acceptable under "one transport per process," but the per-handle token implies per-handle ownership it does not have. Bless the shared-backend model, or make handles own their transport?
