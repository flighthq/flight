# API Alignment: @flighthq/log

**Verdict:** Strong alignment — clean verbs, full type words, correct `import type` split, and a tree-shakable emit/listener seam; the only notable gaps are a missing `getLogSink` companion to `setLogSink` and the deliberately-generic root export `log`.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `setLogSink` | Setter with no `getLogSink` companion. The platform/host backend-seam convention exposes a `get*`/`set*` pair (e.g. `getDialogBackend`/`setDialogBackend`), and this package itself pairs `getLogConsoleLevel`/`setLogConsoleLevel`. The sink is the package's swappable backend but is install-only, so the symmetry is broken. | Either add `getLogSink(): LogSink \| null` for read symmetry, or document in source that the sink is intentionally write-only (install-only) so the asymmetry reads as deliberate. |
| Low | `log` | Bare root-barrel export with no type word. The naming rule wants globally self-identifying names carrying the operated-on type; `log` is the emit verb alone. It is defensible (canonical emit primitive mirroring `console.log`, anchored by the `log*` wrappers) but is the one export not self-describing in isolation. | Keep as-is given the established mirror, but treat as the documented exception; do not let `log` become a template for other bare-verb root exports. |
| Info | `createConsoleCaptureSink` / `setLogSink` vs platform suite | Names a swappable backend a `Sink` rather than a `*Backend`, and uses `setLogSink`/`createConsoleCaptureSink` instead of the suite's `set*Backend`/`create*Backend` triad. Defensible — a `LogSink` is a narrower callback contract than a host `*Backend`, and "sink" is the precise term — but it is a vocabulary divergence from the sibling seams. | No change required; note that `sink` is the intended term for the log listener seam so reviewers do not "correct" it toward `Backend`. |

## Clean

- **Full, unabbreviated type words throughout.** `getLogConsoleLevel`, `setLogConsoleLevel`, `setLogSink`, `createConsoleCaptureSink`, and the `log`/`logDebug`/`logError`/`logInfo`/`logVerbose`/`logWarn` family all spell `Log`/`ConsoleLevel`/`Sink`/`ConsoleCaptureSink` in full — no abbreviations.
- **Verb discipline.** `create*` for the allocating sink factory (`createConsoleCaptureSink`), `get*`/`set*` for the console-level accessor pair, `set*` for the install. No teardown verbs misused (`dispose`/`destroy`/`acquire`/`release` correctly absent — nothing here holds a non-GC resource or pools).
- **Accessor naming.** `getLogConsoleLevel` returns a `LogLevel` (a real getter); no `get*` returning a boolean, and no boolean getter needing `has`/`is` (there are none).
- **Sentinels over throws.** Emit functions no-op until a sink is installed (`_sink?.(...)`); nothing throws for the expected "no sink yet" case. `setLogSink(null)` clears via a sentinel argument rather than a separate `clear*` verb.
- **`Readonly<T>` where intended.** `LogSink` and `writeConsoleCaptureEntry` take `Readonly<LogEntry>`; the internal `_consoleMethods`/`_levelNames` lookup tables are `Readonly<Record<...>>`.
- **`import type {}` on its own line.** `import type { LogData, LogEntry, LogSink }` is separated from the value `import { LogLevel }`; never mixed inline.
- **Cross-package types from `@flighthq/types`.** `LogData`, `LogEntry`, `LogSink`, `LogLevel` all live in `types/src/Log.ts`; nothing is redefined inline.
- **Parameter symmetry.** Every `log*` wrapper has the identical `(data: LogData, channel: string | null = null)` shape, matching `log(level, data, channel)`'s tail. Consistent default and ordering across the family.
- **Tree-shakable, side-effect-free seam.** No top-level registration; module-global state (`_sink`, `_consoleLevel`) is mutated only through explicit `set*` calls; `"sideEffects": false`. The emit half and listener half split cleanly so a sink-less build carries only the forwarders and the `LogLevel` enum.
- **Tests colocated and mirroring exports.** `log.test.ts` has one `describe` per exported function, alphabetized.
