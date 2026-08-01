---
package: '@flighthq/socket'
updated: 2026-07-31
basedOn: ./review.md
---

# socket — Assessment

## Recommended

_None open._ Re-verified against live source on 2026-07-31 (3 source files, 3 test files, 43 tests).
All five sweep items landed and are recorded under [Landed](#landed), outside this section so the TODO
generator stops reporting them as work.

## Landed

1. ~~**Fix `disposeSocket` terminal state.**~~ Landed. Disposal now closes the connection, clears its
   handle, prevents reattachment, and truthfully records the terminal `closed` state.
2. ~~**`explainSocketSendFailure(socket)` query.**~~ Landed. The plain-data query distinguishes terminal
   disposal, no connection, and each non-open phase without invoking or mutating the backend.
3. ~~**`enableSocketGuards` module.**~~ Landed. The separately imported, opt-in guard warns once for an
   unsupported connection and for send/close/enable-signals commands on a disposed socket; core stays
   silent by default.
4. ~~**Test the disposed-socket surfaces.**~~ Landed. Reattach, close, send, signal enablement, late event
   delivery, connection release, and readiness are covered after disposal.
5. ~~**Alias/`Readonly` audit on `sendSocketMessage`.**~~ Landed. The command remains read-only, forwards
   binary data by identity, propagates an open backend's false result, and explicitly covers an open
   state with a null connection.

## Backlog

- **`bufferedAmount` / drain (backpressure)** — parked: extends the `SocketConnection`/`SocketEventSink` seam in `@flighthq/types` and is an API-shape decision (charter Open direction 3; review open direction 1).
- **Negotiated subprotocol/extensions readback** — parked: seam change in `@flighthq/types` (open-event payload vs connection query — review open direction 2).
- **Error payload on `handleSocketError`** — parked: seam change; matters only once a native backend exists with real error data (review open direction 3).
- **Reconnect/backoff helper** — parked permanently per Boundary; a composing layer (`socket-reconnect` or app code) owns policy.
- **`binaryType: 'blob'` support** — parked: deliberately excluded ('arraybuffer' is the only supported value, keeping consumers off Blob); revisit only if a consumer demands it.

## Approved

_Empty — awaiting the user's verbal gate._
