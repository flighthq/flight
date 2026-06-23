# TS↔Rust Alignment: @flighthq/log

**Verdict:** All 10 TS exports are present 1:1 in `flighthq-log` with correct snake_case names and preserved type words; the one substantive difference — module-global emit state in TS vs. an explicit `Log` handle threaded through every function in Rust — is sensible but **undocumented** and should be added to the divergence map, along with the Rust-only test-support surface (`create_capture_sink`, `CaptureSink`).

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| (module-global `_sink`, `_consoleLevel`) | `Log` struct + `create_log(level)` / lib.rs | **Undocumented divergence.** TS keeps emit state in module-level vars; Rust introduces a `Log` handle and adds `create_log`. Every emit/sink function gains a leading `&Log` param. Idiomatic for Rust (no module-global mutable state) but not recorded in the divergence map. |
| `log(level, data, channel)` | `log(log: &Log, level, data, channel)` | Signature shift from the handle change; also `channel: string \| null = null` → `Option<&str>` (correct sentinel mapping, no default-arg in Rust). `data: LogData` → `data: impl Into<LogData>` (additive ergonomic, behavior-equivalent). |
| `logDebug/logError/logInfo/logVerbose/logWarn` | `log_debug/log_error/log_info/log_verbose/log_warn` | Match. Same `&Log` + `impl Into<LogData>` + `Option<&str>` shape. |
| `setLogConsoleLevel` / `getLogConsoleLevel` | `set_log_console_level(&Log, ...)` / `get_log_console_level(&Log)` | Match (with `&Log`). |
| `setLogSink(sink: LogSink \| null)` | `set_log_sink(&Log, sink: Option<Arc<dyn LogSink>>)` | Match. `LogSink` function-type → `trait LogSink { write }`; `null` → `Option`; `Arc` wrapping is the expected Rust sharing form. |
| `createConsoleCaptureSink(): LogSink` | `create_console_capture_sink() -> ConsoleCapturesSink` | Name matches. Return type is the concrete `ConsoleCapturesSink` (TS returns the `LogSink` alias). Note the **typo in the struct name**: `ConsoleCapturesSink` (stray `s`) — cosmetic, but worth fixing since it is the public return type. |
| `LogData = string \| Record<string, unknown>` (types) | `enum LogData { Message(String), Record(HashMap<String,String>) }` | Record value type narrowed from `unknown` to `String`. Acceptable for a string-serialized capture record, but a fidelity narrowing; capture JSON formats values via `{:?}` rather than real JSON, so structured records will not byte-match TS `JSON.stringify`. Worth a divergence note if capture output is ever compared. |
| `LogSink = (entry) => void` (types) | `trait LogSink { fn write(&self, entry: &LogEntry) }` | Function-alias → trait. Standard TS-callback→Rust-trait mapping; the `entry` borrow mirrors `Readonly<LogEntry>`. |
| — | `create_capture_sink` / `CaptureSink` (+ `entries`/`clear`/`len`/`is_empty`) | **Rust-only.** In-memory test sink with no TS counterpart. Legitimate test scaffolding, but it is public crate surface; either gate behind `#[cfg(test)]`/a test feature or record it as a Rust-only addition. |
| — | `LogLevel::as_str` | Rust-only inherent method standing in for the TS private `_levelNames` table. Reasonable; not public API drift. |

File names: TS `log.ts` ↔ Rust `lib.rs` (single-file crate) — acceptable, the crate has one module. No per-domain filename mismatch.

## In sync

- All 10 TS exports map 1:1 to snake_case Rust functions with full type words preserved; conformance script reports `log: 10/10` matched, 0 gaps.
- `LogLevel` enum: identical variants and ordering (`None < Error < Warn < Info < Debug < Verbose`), default console threshold `Info` preserved in both.
- Sentinel/teardown conventions carry correctly: `null` → `Option`, no spurious panics, no teardown verbs needed (no resource ownership). `log` no-ops without a sink in both.
- Two-faced emit/listener split and capture-vs-console-threshold semantics are faithfully reproduced (every level captured; human line only at/above threshold; `None` silences the human line).
- Channel-prefix formatting (`[channel]` / `[flight]`) and the `__flight`-tagged structured envelope are mirrored.

### Divergence-map additions to record

1. **Emit-state model:** TS module-global `_sink`/`_consoleLevel` → Rust explicit `Log` handle + `create_log`; rationale = Rust avoids module-global mutable state and threads an explicit handle (matches the "no hidden global state" intent). This is the load-bearing API-shape difference and is currently silent.
2. **Rust-only test sink:** `create_capture_sink` / `CaptureSink` exist only in Rust as test scaffolding.
3. **`LogData::Record` value narrowing:** `Record<string, unknown>` → `HashMap<String, String>`, and capture serialization uses `{:?}` rather than JSON — note if capture output is ever conformance-compared.
