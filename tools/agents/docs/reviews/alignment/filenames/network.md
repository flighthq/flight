# Filename Alignment: @flighthq/network

**Verdict:** Clean — `@flighthq/network` is a single-implementation event-capability domain (NOT a backend-variant package), so no backend prefix applies; `network.ts` correctly names the domain it covers and `index.ts` is a thin barrel.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/network.ts` — Names the package domain. Holds the full network-connectivity cell: entity (`createNetwork`), lifecycle (`attachNetwork`/`detachNetwork`/`disposeNetwork`), status (`createNetworkStatus`/`getNetworkStatus`/`isNetworkOnline`), and the backend seam (`getNetworkBackend`/`setNetworkBackend`/`createWebNetworkBackend`). All exports operate over the network domain, so a single domain-named file is correct — not a one-function file. Single-implementation domain, so no backend prefix is warranted.
- `src/index.ts` — Standard package barrel (`export * from './network'`).
- `src/network.test.ts` — Colocated test, mirrors `network.ts` exactly.
