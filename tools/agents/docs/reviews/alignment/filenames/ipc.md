# Filename Alignment: @flighthq/ipc

**Verdict:** Clean. Single-implementation domain package (not a backend-variant, so no backend-token prefix applies); the sole source file `ipc.ts` is correctly named after the IPC domain it covers, and its test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/ipc.ts` — domain-named after the inter-process-messaging concept. Holds the full domain surface (`sendIpcMessage`, `invokeIpc`, `onIpcMessage`, plus the `*IpcBackend` seam functions), not a single function, so it passes the folder-removal test. No backend prefix needed: this is a single-implementation seam package whose concrete adapters live elsewhere (`createElectronIpcBackend` in `host-electron`), matching the platform-suite pattern.
- `src/ipc.test.ts` — colocated, mirrors the source basename.
- `src/index.ts` — thin barrel (`export * from './ipc'`), appropriate.
