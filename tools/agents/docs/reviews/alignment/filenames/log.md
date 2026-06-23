# Filename Alignment: @flighthq/log

**Verdict:** Clean. `@flighthq/log` is a single-implementation domain package (no backend variants), so no backend prefix is expected; `src/log.ts` names the logging domain at a glance and houses the whole domain (emit-side `log`/`log*` plus listener-side sink and level setters), not a single function. Tests are colocated and mirror the source.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/log.ts` — Names the logging domain. Despite sharing the name of the central `log` function, the file covers the full domain (`log`, `logDebug`/`logInfo`/`logVerbose`/`logWarn`/`logError`, `setLogSink`, `createConsoleCaptureSink`, `getLogConsoleLevel`/`setLogConsoleLevel`), so it is a domain/object name, not a one-function file. Single-implementation domain — no backend prefix required. Passes the folder-removal test: bare `log.ts` is self-describing.
- `src/log.test.ts` — Colocated test mirroring `log.ts`.
- `src/index.ts` — Conventional package barrel (`export * from './log'`); not flagged.
