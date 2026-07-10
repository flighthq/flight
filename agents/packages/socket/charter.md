---
package: '@flighthq/socket'
crate: flighthq-socket
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# socket — Charter

## What it is

`@flighthq/socket` is the **bidirectional message-transport cell** of the platform-integration suite — the Flight home for what OpenFL/Lime expose as `Socket`/`WebSocket`/`XMLSocket`: open a persistent connection, send and receive messages until it closes. Sibling of `@flighthq/net` (which is one-shot request/response HTTP); `socket` is the long-lived, event-bearing connection.

Because a socket *is* an event source (messages, open, close, error arrive asynchronously over time), it takes the suite's **event-capability** shape — a `Socket` entity with `createSocket`/`attachSocket`/`detachSocket`/`disposeSocket` and typed signals — over a swappable `SocketBackend` with a lazy web default (`WebSocket`). Sending/closing are explicit commands on the entity.

## North star

The complete, Flight-idiomatic persistent-connection transport: connect to a URL, observe open/message/close/error through typed signals, send text or binary frames, read `readyState`, and close cleanly — WebSocket-complete on the web, TCP-capable when a native backend provides it. Plain data and explicit signals throughout; no ambient global event bus, no stateful subclassing.

## Boundaries

- **Depends on `@flighthq/types` + `@flighthq/signals`** and, for the web backend, the DOM `WebSocket`. No display, no renderer. (Corrected 2026-07-10 from the drafted `+ @flighthq/entity`: the entity/runtime split is honored with a plain opaque `SocketRuntime` object in `@flighthq/types` — `@flighthq/entity`'s scene-graph binding machinery is never used by a transport, and pulling it in would add unused weight. Matches `net`/`network`.)
- **Transport only.** It carries frames; it does not define application protocols, reconnection policy, heartbeats, or message framing above the socket — those compose over it (a later `socket-reconnect`/app layer).
- **Not HTTP request/response.** One-shot fetch-style requests are `@flighthq/net`. `socket` is the persistent channel.
- **Web backend = `WebSocket`.** Raw TCP/UDP is only available where a native `SocketBackend` supplies it; the web backend returns a sentinel for unsupported transports rather than throwing.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Event-capability entity shape.** `createSocket(options): Socket` opens the connection; `attachSocket`/`detachSocket` wire the backend; `disposeSocket` detaches listeners and releases it to GC (the underlying connection is closed via an explicit `closeSocket` command first — `dispose*` is not `close*`). Events are typed signals owned on the runtime (`onSocketOpen`, `onSocketMessage`, `onSocketClose`, `onSocketError`), opt-in via `enableSocketSignals` per the SDK's signal-cost rule. Commands: `sendSocketMessage` (text/binary), `closeSocket` (code/reason), `getSocketReadyState`.
  **Why:** a socket is intrinsically multi-listener, over-time notification — the exact condition the SDK reserves signals for — and the event-quartet is the suite's blessed shape for an event capability.
- **[2026-07-10] `Socket`/`SocketBackend`/`SocketMessage`/`SocketReadyState` in `@flighthq/types`.** Header layer owns the shapes; `SocketReadyState` is a string union (`connecting`/`open`/`closing`/`closed`), messages carry a `data` (string | ArrayBuffer) + `binary` flag.
- **[2026-07-10] Swappable `SocketBackend` seam** (`getSocketBackend`/`setSocketBackend`/`createWebSocketBackend`), web default lazy and import-side-effect-free. Native hosts replace via `setSocketBackend` to add TCP/UDP.

## Open directions

1. **Reconnection / backoff.** Auto-reconnect with backoff is policy, not transport — likely a thin composing helper, not core `socket`. Decide its home when built.
2. **Subprotocols + extensions.** WebSocket subprotocol negotiation surface — include in the first build's options or defer.
3. **Backpressure / buffered-amount.** Exposing `bufferedAmount` and a drain signal for flow control — a refinement after the core send/receive path.
