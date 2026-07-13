---
package: '@flighthq/socket'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# socket — Review

## Verdict

`solid` — **74/100**. The event-capability quartet the charter blessed is implemented cleanly: entity + opaque runtime, opt-in signals, explicit send/close commands, a swappable backend with an honest null-connection sentinel. What's missing is the flow-control tier a WebSocket-complete library carries (`bufferedAmount`/drain, negotiated-protocol readback) — the charter's own Open directions 2–3 — plus one small lifecycle wrinkle in `disposeSocket`.

## Present capabilities

All in `packages/socket/src/socket.ts` (ten exports), types in `packages/types/src/Socket.ts`:

- **Entity shape per the Decision** — `createSocket(options)` allocates `Socket` + `SocketRuntime` (connection, lazy signals, readyState, delivering flag) and opens through the active backend; `attachSocket`/`detachSocket` gate event delivery (idempotent, resumable); `disposeSocket` closes-then-detaches and drops the signal group, correctly distinct from `closeSocket` per the dispose-vs-close ruling.
- **Commands** — `sendSocketMessage` (false sentinel when not open, propagates the connection's own false), `closeSocket(code?, reason?)` (`connecting/open → 'closing'`, no-op when already closing/closed), `getSocketReadyState`.
- **Opt-in signals** — `enableSocketSignals` allocates `onSocketOpen`/`onSocketMessage`/`onSocketClose`/`onSocketError` lazily and idempotently; a bare socket keeps `signals: null` and pays nothing, per the suite's signal-cost rule.
- **Event sink** — `makeSocketEventSink` updates readyState and emits signals, with every handler a no-op once `delivering` is false, so late backend events after teardown fire nothing.
- **Web backend** — `createWebSocketBackend` wraps DOM `WebSocket` lazily: protocols and `binaryType: 'arraybuffer'` pass through, messages normalize to `SocketMessage {data, binary}` (no type-sniffing for consumers), close carries `{code, reason, wasClean}`, send guards on `OPEN`. Returns a **null connection** when `WebSocket` is undefined or the transport is unsupported — the charter's sentinel rule, verbatim.
- **Types** — the full quartet in `@flighthq/types/Socket.ts`: `Socket`, `SocketRuntime`, `SocketBackend`, `SocketConnection`, `SocketEventSink`, `SocketSignals`, `SocketMessage`, `SocketCloseInfo`, `SocketOptions`, `SocketReadyState` (the four WebSocket-standard phases).
- **Tests** (`socket.test.ts`, 27 cases) cover the readyState lifecycle, detach/attach/dispose delivery gating, null-connection tolerance, message/close/error emission, web-backend construction and translation, and the seam trio.

## Gaps

Against a WebSocket-complete transport (the charter's North star), each concrete:

1. **Backpressure / `bufferedAmount`** (charter Open direction 3) — no way to read the send buffer depth or observe drain; a caller streaming binary frames cannot flow-control. `SocketConnection` has no surface for it.
2. **Negotiated subprotocol readback** — `SocketOptions.protocols` requests subprotocols but nothing exposes which one the server accepted (`WebSocket.protocol`); a client that offered two cannot know which to speak. Extensions (`WebSocket.extensions`) likewise unreadable. (Open direction 2 said "include in the first build's options or defer" — options half landed, readback did not.)
3. **`disposeSocket` leaves readyState `'closing'` forever** — `closeSocket` sets `'closing'`, then `detachSocket` stops the sink from ever recording the backend's close, so `getSocketReadyState` on a disposed socket reports `'closing'`, not `'closed'`. The entity is documented inert after dispose, but the observable state is a small lie; a dispose could set `'closed'` directly.
4. **Error detail** — `onSocketError` carries no payload. The DOM error event is genuinely opaque, but a native TCP backend will have real error codes and the sink shape (`handleSocketError()`) gives it nowhere to put them.
5. **Diagnostics** — silent sentinels (null connection, false send) with no `explainSocket*` query and no `enableSocketGuards` (e.g. "send on a disposed socket" warns nowhere), contra the diagnostics inversion rule.
6. **Reconnection/heartbeat** — correctly absent per Boundary (compose-over policy); checked, not a gap.

## Charter contradictions

None. The corrected dependency Boundary (types + signals, **no** `@flighthq/entity`) holds — `SocketRuntime` is a plain interface in `@flighthq/types`. All three 2026-07-10 Decisions are implemented as written, including the dispose≠close distinction.

## Contract & docs fit

- **Package side**: single root export, `sideEffects: false` (lazy backend, no import-time `WebSocket` touch), unabbreviated `Socket`-carrying names, sentinels not throws, `Readonly<>` discipline, private state at file bottom, every export tested. Clean.
- **Docs side**: the Package Map line ("bidirectional persistent-connection transport — the long-lived sibling of net") matches. One nit: the charter Decision names `enableSocketSignals` "per the SDK's signal-cost rule" and the code delivers exactly that — no drift.

## Candidate open directions

1. Should `SocketConnection` grow `getSocketBufferedAmount()` (+ an optional drain event on the sink), or is flow control a native-backend-only concern surfaced later? Touches the `@flighthq/types` seam.
2. Where does the accepted-subprotocol live — a runtime field filled by the open event (`handleSocketOpen(protocol?)`) or a query on the connection? Both change the seam.
3. Should `handleSocketError` carry an optional plain-data error descriptor for native backends, with the web backend passing nothing?
4. Same suite-wide question as `net`: per-package `enableSocketGuards` or one platform-suite guard module?
