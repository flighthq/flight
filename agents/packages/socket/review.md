---
package: '@flighthq/socket'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - status.md
  - source
  - charter.md
  - assessment.md
---

# socket -- Review

## Verdict

`solid` -- **80/100**. The previous review's five concrete gaps have all been addressed: `disposeSocket` now records terminal `closed` state, the `explainSocketSendFailure` plain-data query covers every deterministic false path, and `enableSocketGuards` warns on no-connection and disposed-socket commands through `@flighthq/log`. The explicit-host migration landed cleanly -- `createSocket(host, options)` resolves its backend from `host.net.socket` with no process-global fallback, and `socketHost.test.ts` proves host isolation and absent-provider sentinel behavior. Raw TCP is exposed through `openTcpSocket` as a separate byte-stream path on the same `SocketBackend` seam. The remaining gaps are the charter's own acknowledged open directions (backpressure, subprotocol readback, error payload), none of which block a functional transport cell.

## Present capabilities

Source: 3 files (`socket.ts`, `enableSocketGuards.ts`, `explainSocketSendFailure.ts`). Tests: 4 files, 48 cases. Types: `packages/types/src/Socket.ts` (15 type exports).

- **Entity lifecycle** -- `createSocket(host, options)` allocates `Socket` + `SocketRuntime`, opens through `host.net.socket` (the explicit-host seam), and wires backend events into the runtime's sink. `attachSocket`/`detachSocket` gate signal delivery (idempotent, resumable). `disposeSocket` closes the connection, clears its handle, prevents reattachment, sets `readyState` to `closed`, and marks the runtime as terminally disposed.
- **Commands** -- `sendSocketMessage(socket, data)` returns `false` as a sentinel for disposed, not-open, no-connection, or backend-rejected sends. `closeSocket(socket, code?, reason?)` transitions `connecting`/`open` to `closing`; the backend's close event completes the transition to `closed`. Both guard against disposed sockets through the nullable `_guard` hook.
- **Opt-in signals** -- `enableSocketSignals(socket)` lazily allocates `onSocketOpen`/`onSocketMessage`/`onSocketClose`/`onSocketError`. A bare socket keeps `runtime.signals` null and pays no dispatch cost. On a disposed socket the function allocates an inert stable group and fires the guard.
- **Event sink** -- `makeSocketEventSink(runtime)` builds the backend-to-entity bridge: updates `readyState`, emits signals. Every handler is a no-op once `runtime.delivering` is false, so late backend events after teardown fire nothing.
- **Web backend** -- `createWebSocketBackend()` (contract-lane only) wraps DOM `WebSocket`: protocols and `binaryType` pass through, messages normalize to `SocketMessage { data, binary }`, close carries `{ code, reason, wasClean }`. Returns a null connection when `WebSocket` is undefined. Consumed by `host-web` via `@flighthq/socket/contract`.
- **Raw TCP** -- `openTcpSocket(host, options)` dispatches to the optional `openTcpSocket` slot on `SocketBackend`. The web backend omits it, so `openTcpSocket` returns null without touching the framed `openSocket` path. `TcpSocketConnection` exposes `readable`/`writable` streams plus `closeTcpSocketConnection`.
- **Diagnostics** -- `explainSocketSendFailure(socket)` returns a plain-data `SocketSendFailureExplanation` (`disposed`/`no-connection`/`not-open`) or null when the socket can reach its backend. `enableSocketGuards()`/`disableSocketGuards()`/`areSocketGuardsEnabled()` install an opt-in `logOnce` hook warning on no-connection creation and disposed-socket commands. The guard message points callers at `host.net.socket` (updated from the deleted `setSocketBackend` reference).
- **Readonly discipline** -- `getSocketReadyState` and `sendSocketMessage` accept `Readonly<Socket>`. `SocketOptions`, `SocketEventSink`, `SocketMessage`, `SocketCloseInfo`, and `TcpSocketOptions` are `Readonly` at their consumption boundaries.

## Gaps

Against the charter's "WebSocket-complete" north star, three acknowledged open directions remain:

1. **Backpressure / `bufferedAmount`** (charter Open direction 3) -- no way to read the send buffer depth or observe drain. `SocketConnection` has no surface for it. A caller streaming binary frames cannot flow-control.
2. **Negotiated subprotocol readback** (charter Open direction 2) -- `SocketOptions.protocols` requests subprotocols but nothing exposes which one the server accepted (`WebSocket.protocol`). Extensions (`WebSocket.extensions`) likewise unreadable.
3. **Error payload** -- `handleSocketError()` carries no data. The DOM error event is opaque, but a native TCP backend may have real error codes and the sink gives it nowhere to put them.

These are parked by design (assessment Backlog) and each requires a seam change in `@flighthq/types`.

## Charter contradictions

1. **Boundary statement is slightly stale.** The charter (2026-07-10 correction) says "Depends on `@flighthq/types` + `@flighthq/signals`", but `package.json` also lists `@flighthq/log`. The log dependency is real and correct -- `enableSocketGuards` imports `logOnce` from `@flighthq/log/contract`, and the diagnostics convention endorses log-backed guards. The charter boundary should be updated to include `@flighthq/log` (guard-layer only).
2. **Charter Decision still names the deleted seam trio.** The 2026-07-10 Decision references "`getSocketBackend`/`setSocketBackend`/`createWebSocketBackend`" as a "swappable `SocketBackend` seam". The first two were removed in the explicit-host migration. `createWebSocketBackend` survives as a contract-lane export consumed by `host-web`. The charter's Decision text has not been updated to reflect the host-based resolution model.

## Contract & docs fit

- **Two-lane exports** -- `index.ts` re-exports 13 functions from `./contract` (the public lane). `contract.ts` additionally exposes `createWebSocketBackend` and `setSocketGuard` -- correctly restricted to the contract lane for host backends and the guard module's internal wiring. Clean separation.
- **`sideEffects: false`** -- honored. `createWebSocketBackend` defers DOM `WebSocket` construction to `openSocket` call time. The module-scoped `_guard` starts null and is only set by explicit opt-in. No import-time side effects.
- **Naming** -- every exported function carries the unabbreviated `Socket` type name. `openTcpSocket`, `closeTcpSocketConnection`, and `TcpSocketOptions` carry the full `TcpSocket` compound. Globally self-identifying.
- **Sentinels not throws** -- `sendSocketMessage` returns `false`; `createSocket` with no provider yields a null connection and `connecting` state; `openTcpSocket` returns null for unsupported transports. No throws for expected failure cases.
- **Test colocality** -- one test file per source file, `describe` blocks alphabetized and mirroring exported names. `socketHost.test.ts` is a separate file testing the host-isolation property introduced by the migration.
- **Module-scoped guard hook** -- `_guard` is a nullable module-scoped variable, which is the exact pattern endorsed by the diagnostics convention for packages without a state object.

## Candidate open directions

1. `bufferedAmount` / drain -- should `SocketConnection` grow a `getSocketBufferedAmount()` query and an optional drain callback on the sink? Requires a seam change in `@flighthq/types`.
2. Accepted-subprotocol readback -- where does it live? A runtime field filled by `handleSocketOpen(protocol?)`, or a query on the connection? Both change the sink and connection seams.
3. Error payload on `handleSocketError` -- an optional plain-data error descriptor for native backends, with the web backend passing nothing.
4. Charter housekeeping -- update the boundary to include `@flighthq/log` and revise the 2026-07-10 Decision text to reflect the explicit-host model (delete references to the removed `getSocketBackend`/`setSocketBackend`).
