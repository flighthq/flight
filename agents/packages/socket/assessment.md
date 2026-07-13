---
package: '@flighthq/socket'
updated: 2026-07-13
basedOn: ./review.md
---

# socket — Assessment

## Recommended

Sweep-safe, within-package, no design fork:

1. **Fix `disposeSocket` terminal state** — set `runtime.readyState = 'closed'` in dispose (after the close command), so a disposed socket never reports `'closing'` forever. Behavioral truthfulness fix, entity-local, plus tests.
2. **`explainSocketSendFailure(socket)` query** — shakeable plain-data explainer for the false-send sentinel (no connection / not open / disposed), per the diagnostics inversion rule.
3. **`enableSocketGuards` module** — opt-in warnings via `@flighthq/log` for misuse the sentinels hide: send/close/enable-signals on a disposed socket, createSocket that yielded a null connection (unsupported transport). Separately importable.
4. **Test the disposed-socket surfaces** — send-after-dispose, close-after-dispose, enableSocketSignals-after-dispose; the current suite covers fresh-socket dispose but not post-dispose command behavior.
5. **Alias/`Readonly` audit on `sendSocketMessage`** — it takes `Readonly<Socket>` but mutates nothing; confirm and keep, adding a doc-comment test for the false-propagation path with a half-open backend (mostly covered; extend to the null-connection case explicitly).

## Backlog

- **`bufferedAmount` / drain (backpressure)** — parked: extends the `SocketConnection`/`SocketEventSink` seam in `@flighthq/types` and is an API-shape decision (charter Open direction 3; review open direction 1).
- **Negotiated subprotocol/extensions readback** — parked: seam change in `@flighthq/types` (open-event payload vs connection query — review open direction 2).
- **Error payload on `handleSocketError`** — parked: seam change; matters only once a native backend exists with real error data (review open direction 3).
- **Reconnect/backoff helper** — parked permanently per Boundary; a composing layer (`socket-reconnect` or app code) owns policy.
- **`binaryType: 'blob'` support** — parked: deliberately excluded ('arraybuffer' is the only supported value, keeping consumers off Blob); revisit only if a consumer demands it.

## Approved

_Empty — awaiting the user's verbal gate._
