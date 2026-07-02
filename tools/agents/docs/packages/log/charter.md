---
package: '@flighthq/log'
crate: flighthq-log
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# log — Charter

## What it is

`@flighthq/log` is the **leveled structured logging library** — `log(level, data, channel?)` with severity wrappers, multi-sink fan-out (console, memory, file, buffered, rate-limited, sampled, filtered, fanout), per-channel level gating, formatters (text, JSON), transports, timing/spans, groups, assertions, and redaction. 61 exports in 1 source file, 114 tests. Dependencies: `signals`, `types`.

## North star

1. **SDK diagnostic layer.** Log is the SDK's own logging surface — leveled, structured, capture-aware. It is not a distributed tracing library or a production observability platform.
2. **Composable sinks.** Sinks are combinators (filter, rate-limit, sample, buffer, fanout) that compose freely. A sink pipeline is explicit — the user builds it.
3. **Near scope ceiling.** 61 exports covering core + 8 sink types + 2 formatters + timing/spans + groups + assertions + redaction + channel levels + serializers is a complete diagnostic logging surface for a graphics SDK.

## Boundaries

**In scope:**

- Core logging: `log()`, severity wrappers, lazy data providers.
- Sink types: console, memory, file, buffered, rate-limited, sampled, filtered, fanout.
- Formatters: text, JSON.
- Timing: spans, timers.
- Groups, assertions, once-logging, redaction, serializers.
- Per-channel level gating.
- Signal hooks for log events.

**Non-goals:**

- Distributed tracing / correlation IDs / request context propagation.
- Log aggregation / shipping to external services (composable via sinks).

## Decisions

- **[2026-07-02] Missing types must be rebuilt.** 7 types imported from `@flighthq/types` were never committed: `LogContext`, `LogDataProvider`, `LogFormatter`, `LogSignals`, `LogSpan`, `LogTimer`, `LogTransportBackend`. Likely lost agent work. Blocking prerequisite.

  **Why:** The package cannot compile without its types.

- **[2026-07-02] The 61-export single file should decompose.** Natural candidates: core log engine, sinks, formatters, timing/spans. The file is too large for one module.

  **Why:** Big files are monoliths. The sink combinators, formatters, and timing/spans are distinct primitives bundled in one file.

- **[2026-07-02] Near scope ceiling.** 61 exports is a complete diagnostic logging surface. Growth would be additive sink types or formatter variants, not new subsystems.

  **Why:** The current surface covers everything a graphics SDK logger needs.

- **[2026-07-02] Remove structural divider comments.** 3 `// ---- section ----` style comments violate source style.

  **Why:** Source style rule: use names, file boundaries, and package boundaries instead. Decomposition will create natural boundaries.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Decomposition plan.** Which files does log.ts split into? Candidates: `logCore.ts` (log, severity wrappers, levels, channels), `logSink.ts` (sink types and combinators), `logFormat.ts` (formatters), `logTiming.ts` (spans, timers, groups). The barrel stays thin.

2. **Package Map update.** Expand the current entry.
