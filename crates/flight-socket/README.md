# flight-socket

Socket capability seam: the framed persistent-connection lifecycle (connecting, open, closing,
closed), a lazily allocated opt-in signal group, and raw TCP byte streams, all routed through the
caller's explicit host provider. No WebSocket, TCP, browser or native transport is implemented
here; every connection, event sink and stream is supplied by the host.

## Per-socket runtime

The source keeps an opaque `SocketRuntime` object on the socket entity (`connection`, `signals`,
`readyState`, `delivering`, `disposed`) and calls it internal. Rust stores that record in the
entity's private runtime binding, so the lifecycle functions are its only readers and writers, and
two sockets never share state. `initialize_socket` (contract lane) attaches the `connecting`
runtime before the provider is called, so a provider that fires events synchronously during
`open_socket` already observes live state.

## Delivery gating

`attach_socket`/`detach_socket` toggle a resumable delivery flag; `dispose_socket` is terminal.
The provider-to-entity sink checks `delivering` before every state update, so provider events after
detach or dispose neither emit signals nor move the ready state. Open and close update the phase
before emitting, so a listener that re-enters the lifecycle functions sees the new phase. Signals
are emitted outside the socket lock, and provider callbacks (send, close, open) are invoked outside
it too, so a provider or listener may re-enter without deadlock.

## Caller-owned guard state

The source keeps a module-level `_guard` hook plus an `_enabled` flag. Both become one explicit
caller-owned `SocketGuardState` (D5), passed to every lifecycle function that can emit a notice.
`enable_socket_guards` installs an adapter that captures the caller's `LogStateRef` and live clock
at enable time and samples the clock at each notice, so timestamps are operation time rather than
enable time. `set_socket_guard` installs or removes a hook without changing the enabled flag,
exactly as the source keeps those two independent. Guard dispatch happens outside the socket lock.

## Raw TCP

`open_tcp_socket` is a distinct optional capability (`HostSocketCapability.open_tcp_socket`). A
framed-only provider omits it and the function returns `null` without calling `open_socket` or
reinterpreting the endpoint as a WebSocket URL. A live TCP connection exposes the canonical D20
`ReadableStream`/`WritableStream` pair from `flight-stream` plus an explicit close; no frame
boundaries are invented.

## Payloads

`SocketMessage.data` is the TS `string | ArrayBuffer` union. Rust spells it as
`SocketMessageData::Text(String) | SocketMessageData::Binary(ArrayBuffer)` using the canonical
`flight-buffer` `ArrayBuffer` (fixed-length shared storage; cloning preserves allocation identity
and never copies or flattens the bytes) and keeps the source's `binary` flag, which mirrors the
variant. Sends and emissions pass the payload by reference, so the frame, its `ArrayBuffer`
allocation and any provider aliases retain the same identity across the boundary.

`SocketSendFailureExplanation`'s three source variants carry the same `reason`/`readyState`/`url`
fields and differ only in the reason literal and the narrowed ready-state domain; one record with
an explicit `SocketSendFailureReason` enum represents them.

## Sugar (D18)

Every public-lane operation with a socket-owned receiver has a thin delegate, each covered by one
inline comparison against its free function:

- `SocketMethods` on `Ref<Socket>`: `attach`, `close(guard_state, code, reason)`, `detach`,
  `dispose`, `enable_signals(guard_state)`, `explain_send_failure`, `get_ready_state`,
  `send_message(guard_state, data)`. The socket lives behind `Ref` identity, so the methods live on
  that handle; the caller-owned guard state stays explicit on every method that can emit a notice.
- `Socket::new(guard_state, host, options)` mirrors `create_socket`.
- `HostSocketCapability::{open_socket, open_tcp_socket}` mirror the source capability methods.
- `SocketConnection::{send_socket_frame, close_socket_connection}` and
  `TcpSocketConnection::close_tcp_socket_connection` mirror the source interface methods.
- `SocketGuardStateMethods` on `Ref<SocketGuardState>`: `are_guards_enabled`, `disable_guards`,
  `enable_guards(log_state, clock)`.

No sugar exists — and none is invented — for `SocketSignals` (no public function takes it as its
primary argument; it is only returned by `enable_socket_signals`), for the plain payload/options/
runtime records (`SocketMessage`, `SocketMessageData`, `SocketCloseInfo`, `SocketOptions`,
`TcpSocketOptions`, `SocketRuntime`, `HostSocketCapabilities`, the guard notice/reason records and
the send-failure explanation), for the contract-only `set_socket_guard`/`initialize_socket` seams,
or for the contract-only string-table helpers. No plain-record factory is added.

## Precision

Close codes and TCP ports are `i32` (D1 default; no source evidence requires wider). The only
`f64` is the injected guard clock's millisecond timestamp.
