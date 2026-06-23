# Filename Alignment: @flighthq/protocol

**Verdict:** Clean. This is a single-implementation platform-capability package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so no backend prefix applies; the lone source file `protocol.ts` names the domain/object it covers and is self-describing without its folder.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — barrel re-export (`export * from './protocol'`), the conventional single-entry root for the package.
- `protocol.ts` — names the package domain (custom URI-scheme / deep-link protocol capability) and the object family it operates over (`ProtocolBackend`, `ProtocolHandler`). Passes the folder-removal test: the bare filename identifies the domain at a glance. Not named after any single function despite holding the full backend-seam + handler API (`registerProtocolScheme`, `attachProtocolHandler`, `setProtocolBackend`, etc.).
- `protocol.test.ts` — colocated, mirrors the `protocol.ts` source filename exactly.
