---
package: "@flighthq/socket"
updated: 2026-08-30
by: builder2
---

# socket — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-08-30 — Explicit Host migration

`createSocket(host, options)` opens through `host.net.socket`. A host carrying no socket provider
yields a null connection instead of reaching a process-global fallback.

DELETED: `getSocketBackend`, `setSocketBackend`, `installSocketHostBackend`,
`resetSocketBackendForTest`, and the `_custom / _host / _webFallback` chain — including the lazy web
fallback, which was the ambient part of it. host-web publishes `webSocketBackend` on
`webHost.net.socket`; no native host carries the slot, because none implements a socket transport, so
no Host advertises a provider it does not have.

PRESERVED unchanged, as scoped: the package-owned guard hook (`setSocketGuard` / `_guard`),
send/close/dispose semantics, the backend→entity event sink, and the entity/runtime lifecycle.

★ WATCH: the `no-connection` guard message used to tell callers to `setSocketBackend(...)`, which this
change deletes. A diagnostic naming a removed remedy is worse than no diagnostic, so it now points at
the host's `net.socket` slot. Any other guard text that names a resolver verb needs the same check.
