# Depth Review: @flighthq/log

**Domain:** Application/SDK logging — leveled, structured, capture-aware diagnostic logging.

**Verdict:** partial — completeness 48/100

The package is a clean, purpose-built logging seam: a tree-shakable emit side (`log` + severity wrappers) and a listener side (a single console-capture sink plus a console verbosity threshold). It does exactly what the SDK's tooling needs (feed the Playwright capture harness `logs.jsonl` and print human console lines), and it does it well. But measured against what a _mature, standalone, authoritative_ logging library provides, it covers only the core of the field. It is more than a stub — the level model, channel tagging, sink seam, and the deliberate emit/listener split are real design — but it is well short of the canonical feature set.

## Present capabilities

Exported surface (from `src/log.ts`, types in `@flighthq/types` `Log.ts`):

- **Six-level severity model** — `LogLevel` enum: `None`, `Error`, `Warn`, `Info`, `Debug`, `Verbose` (ordered 0–5). Severity doubles as a verbosity threshold. This is the canonical level ladder and is correctly ordered.
- **Emit API** — `log(level, data, channel?)` plus severity-named wrappers `logError`, `logWarn`, `logInfo`, `logDebug`, `logVerbose`. Each is a featherweight forwarder to the installed sink; no-op until a sink is installed. Mirrors `console.*` naming conventions.
- **Structured payloads** — `LogData = string | Readonly<Record<string, unknown>>`. Supports both plain-message and structured-record logging, the modern structured-logging baseline.
- **Channel/category tagging** — free `channel` string tag (`'batch'`, `'shader'`, `'user'`) for filtering captured output; `null` when uncategorized.
- **Sink seam** — `LogSink = (entry) => void` installed via `setLogSink(sink | null)`. A single, swappable, free-function transport — clean, portable, and the right abstraction shape for this codebase (no class hierarchy).
- **Console-capture sink** — `createConsoleCaptureSink()` emits every entry as a tagged JSON envelope on `console.debug` (so the Playwright collector captures all levels into `logs.jsonl`) and _additionally_ prints a human-readable line via the matching `console` method for entries at/above the threshold.
- **Console verbosity threshold** — `setLogConsoleLevel(level)` / `getLogConsoleLevel()` gate the human-readable console subset independently of the always-complete machine record. Clean separation of "machine record" vs "human view."
- **Timestamping** — capture envelope stamps `t` via `performance.now()` with a `Date.now()` fallback.
- **Good test coverage** — every exported function has a colocated `describe`; tests assert forwarding, defaults, threshold gating, string-vs-record envelopes, and sink clearing.

## Gaps vs an authoritative logging library

Compared to the canonical feature set of mature loggers (pino, winston, bunyan, log4j/SLF4J, Serilog, Rust `tracing`/`log`), the following are absent. Most are missing-by-omission, not missing-by-design:

- **Multiple sinks / fan-out.** Only one sink can be installed; `setLogSink` replaces. There is no transport list, no per-sink level, no `addSink`/`removeSink`. Every real logger supports multiple transports (console + file + remote) with independent filtering. This is the single largest gap.
- **Per-channel / per-logger level control.** `channel` is a passive tag only — there is no way to set a level _per channel_ (e.g. mute `'shader'` to Warn while `'batch'` stays Verbose). Canonical loggers offer per-category/per-logger thresholds (log4j category levels, `tracing` per-target filters, `DEBUG=app:*` namespace filtering). The threshold here is a single global console gate.
- **Emit-side level gating.** `log()` always forwards to the sink regardless of level; gating happens only at the console-print step. There is no global minimum emit level to suppress work early, and no lazy/deferred payload evaluation (`() => expensive()`), so a no-op verbose call still allocates its data object. Mature loggers short-circuit before constructing the message.
- **Child/contextual loggers & bound fields.** No `createLogger(context)` / child loggers, no bound base fields (request id, session, component) merged into every entry. Structured loggers universally support this (`logger.child({reqId})`, MDC, `tracing` spans).
- **Formatting/serialization layer.** Exactly one output format (the hardcoded `__flight` JSON envelope + a fixed `[channel] message` console line). No pluggable formatter, no pretty vs JSON modes, no field redaction, no custom serializers for error objects (an `Error` passed as data would not serialize its stack via `JSON.stringify`).
- **Built-in transports beyond console.** No file sink, no buffering/batching sink, no HTTP/remote sink, no ring-buffer/in-memory sink for "last N entries." Users must hand-write these against `LogSink` (which is at least possible, but a library at AAA depth ships the common ones).
- **Rate limiting / sampling / dedup.** No throttling, no "log once," no sampling — standard in production loggers to prevent log floods (notably relevant in a per-frame render loop).
- **Timing/measurement helpers.** No `time`/`timeEnd`, counters, or span/scope helpers despite the capture domain being performance-adjacent.
- **Assertion/grouping conveniences.** No `assert`-style log, no `console.group`-style nesting in the human output.
- **Level name/parse round-trip in the public API.** `_levelNames` exists internally but there is no exported `getLogLevelName` / `parseLogLevel`, so consumers reconstructing levels from the captured `level` string must reimplement the map.

Missing-by-design (correctly out of scope, not faults): no logger _class_, no global singleton object (free functions + module state is the house style), no eager registration (sink install is opt-in), no Canvas/DOM coupling.

## Naming / API-shape notes

- Naming is consistent with house rules: full unabbreviated type word in every export (`setLogSink`, `getLogConsoleLevel`, `setLogConsoleLevel`, `createConsoleCaptureSink`), `get*`/`set*`/`create*` prefixes used correctly, severity wrappers mirror `console.*`.
- The emit/listener split is a genuinely good design call and is well documented in source comments — the emit side tree-shakes to almost nothing when no sink is installed.
- Module-level mutable state (`_sink`, `_consoleLevel`) is global/process-wide. This matches the platform-suite backend-seam pattern (one ambient default, swappable), and is acceptable, but it does foreclose multiple independent loggers without a redesign.
- `setLogSink` as single-slot is the naming that bakes in the "one sink" limitation; an authoritative version would likely be `addLogSink`/`removeLogSink` (or a sink list) with `setLogSink` reserved for the replace-all case.
- The package is **not listed in the Package Map** (`tools/agents/docs/index.md`), though it is exported from `@flighthq/sdk` and consumed by the tooling. If it is intended to remain a real package, it should appear in the map with its scope stated.

## Recommendation

Treat this as a deliberately narrow, well-built logging _seam_ that is currently sized for one job (the capture harness), not as an authoritative logging library. That framing is defensible for the SDK's needs, but per the project's AAA-completeness rule the package as named (`log`) is expected to grow into the full domain. To move from _partial_ toward _authoritative_, prioritize, in order:

1. **Multiple sinks with per-sink level** (`addLogSink`/`removeLogSink` + fan-out) — the biggest gap and the foundation for everything else.
2. **Per-channel level filtering** and a **global emit-level gate** (with optional lazy `() => LogData` payloads) so verbose logging is genuinely free in hot paths.
3. **Child/contextual loggers** with bound base fields, the structured-logging table stakes.
4. **A small set of built-in sinks** (in-memory ring buffer, JSON formatter, plus the existing console-capture) and a **pluggable formatter** seam with error-object serialization.
5. Export `getLogLevelName` / `parseLogLevel`, add the package to the Package Map, and consider rate-limiting/sampling given the per-frame render context.

Until at least items 1–3 land, this is a solid, idiomatic logging _core_ — not the exhaustive, full-featured logging library the domain name implies.
