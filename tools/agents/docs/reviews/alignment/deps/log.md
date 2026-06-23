# Dependency Alignment: @flighthq/log

**Verdict:** Clean — a single, predictable dependency on `@flighthq/types` (pinned `*`), all imports declared and used, type-only imports correctly split, and `sideEffects: false` preserved.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Sole runtime dependency. All four Log contracts (`LogLevel`, `LogData`, `LogEntry`, `LogSink`) are defined in the header layer (`packages/types/src/Log.ts`), not redefined inline. Predictable for a logging package that emits `LogEntry` to a `LogSink`. | — |
| None | `@flighthq/sdk` | Not imported. No barrel reach-back. | — |
| Info | `import type` discipline | `LogData`, `LogEntry`, `LogSink` correctly imported via `import type` on their own line; `LogLevel` (a runtime `enum`) correctly imported as a value. The only retained runtime weight from `@flighthq/types` is the `LogLevel` enum, which is the intended featherweight emit-side footprint described in the source header comment. | — |
| Info | Tree-shakability | `"sideEffects": false` set; no top-level registration, listeners, or mutable shared state initialized eagerly (`_sink`/`_consoleLevel` are module-private slots set only via explicit `setLog*` calls). Emit/listener split lets a sink-less build drop the console path. | — |

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is the only dependency and is used (value import `LogLevel` + type imports).
- **Phantom (used-but-undeclared) deps:** none. The only non-relative import in `src/` is `@flighthq/types`, which is declared.
- **Workspace pin:** `@flighthq/types` pinned `"*"` per convention. Correct.
- **devDependencies:** `typescript` only — appropriate.
- `npm run packages:check` passes (86 packages, 16 examples valid); this review adds no findings beyond it.
