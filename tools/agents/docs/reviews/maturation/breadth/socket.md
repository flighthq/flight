# New Package Spec: @flighthq/socket

**Represents** — WebSocket / message-stream transport: open a connection, send and receive text and binary frames, observe state and backpressure, reconnect, and close with codes — all over a swappable `SocketBackend` seam, exactly as the platform suite swaps every other host capability.

**Requested by** — missing-domains

**Fits**

- **Layer.** A platform-suite-style _command + event_ capability cell. It is the streaming sibling of the requested `@flighthq/http` (request/response transport): `http` is one-shot fetch, `socket` is a long-lived bidirectional channel. Both are distinct from `@flighthq/network`, which is connectivity _status_ only (online/offline signals) and whose name is already taken — confirmed in the missing-domains review.
- **Dependencies.** `@flighthq/types` (the `Socket*` contracts), `@flighthq/signals` (the connection's signal group). Nothing else. No render, no node, no application coupling. `"sideEffects": false`, single root `.` export, tree-shakable.
- **Backend seam.** `SocketBackend` defined in `@flighthq/types`; `getSocketBackend()` / `setSocketBackend(backend)` / `createWebSocketBackend()` over the browser `WebSocket` global. Native hosts (Electron/Tauri/C shell) and the Rust port register their own backend (`tokio-tungstenite` etc.); the web backend guards the global and returns sentinels when `WebSocket` is absent (SSR/jsdom) rather than throwing.
- **Neighbor packages.**
  - `@flighthq/socket-formats` — optional frame _codecs_ (JSON, MessagePack, length-prefixed binary, line-delimited) as plain encode/decode descriptors. Follows the established `-formats` neighbor pattern (`particles-formats`, `spritesheet-formats`); keeps serialization out of the transport core so the base package stays codec-agnostic.
  - Companion `@flighthq/http` (separate spec) shares the connectivity vocabulary but not code.
- **Rust crate.** `flighthq-socket` (and `flighthq-socket-formats`), mirroring the TS package per the 1:1 conformance rule. Native default backend behind a `native` cargo feature (`tokio-tungstenite`); `host-web` fills the wasm `WebSocket` seam. The seam stays native-clean per the async/`Send` rule — `host-web` bridges to `!Send` internally.

The naming choice is `socket` (matches OpenFL's `Socket` and the review's recommendation) covering the WebSocket transport. `WebSocket` is the _backend technology_, not the package name; the package surface speaks in `Socket*` so a future raw-TCP native backend slots under the same seam.

## Bronze

The minimum useful, shippable WebSocket client: connect, send/receive text+binary, observe state, close. Plain-data entity + free functions + one signal group.

- **Types in `@flighthq/types/Socket.ts` first:**
  - `SocketKind = 'Socket'` — string kind identifier (PascalCase), for registry/serialization symmetry with the rest of the SDK.
  - `SocketReadyState = 'connecting' | 'open' | 'closing' | 'closed'` — explicit string enum, not the numeric `WebSocket.readyState`.
  - `SocketMessage` — `{ data: string | ArrayBuffer; isBinary: boolean }` (plain data, no event wrapper).
  - `SocketCloseInfo` — `{ code: number; reason: string; wasClean: boolean }`.
  - `SocketOptions` — `Readonly` config: `{ url: string; protocols?: readonly string[]; binaryType?: 'arraybuffer' }`.
  - `SocketBackend` — the seam: `open(options, handlers): SocketHandle`, where `SocketHandle` is `{ send(data: string | ArrayBuffer): boolean; close(code: number, reason: string): void; getReadyState(): SocketReadyState }` and `handlers` is a struct of direct callbacks (`onOpen`, `onMessage(out: SocketMessage)`, `onClose(out: SocketCloseInfo)`, `onError`). Direct callbacks here (strict internal wiring, single callsite), not signals.
  - `Socket` — the public entity: `{ kind: typeof SocketKind; readyState: SocketReadyState; bufferedAmount: number; signals: SocketSignals | null }` plus an opaque `SocketRuntime` slot holding the live `SocketHandle`. Public state fields are plain data; the handle is runtime-private.
  - `SocketSignals` — the signal group: `onOpen`, `onMessage`, `onClose`, `onError` signals (created lazily, see `enableSocketSignals`).
- **Functions in `@flighthq/socket`:**
  - `createSocket(options): Socket` — allocates the entity in `connecting`/`closed`-inert state; does **not** open. Explicit allocation.
  - `openSocket(socket): void` — opens via `getSocketBackend()`, wires backend callbacks into the entity (updating `readyState`, `bufferedAmount`) and into signals if enabled.
  - `sendSocketText(socket, text): boolean` — returns `false` (sentinel) when not open instead of throwing.
  - `sendSocketBinary(socket, data: ArrayBuffer | ArrayBufferView): boolean` — same sentinel contract.
  - `closeSocket(socket, code?, reason?): void` — defaults to a normal-closure code.
  - `getSocketReadyState(socket): SocketReadyState`.
  - `isSocketOpen(socket): boolean`.
  - `disposeSocket(socket): void` — closes if open, detaches callbacks/signals, releases to GC. (`dispose*`, not `destroy*` — no non-GC resource is owned beyond the backend handle, which the backend frees.)
  - **Signals group, opt-in:** `enableSocketSignals(socket): SocketSignals` and `createSocketSignals(): SocketSignals` in this package (owner of the entity), so the signal cost is opt-in per the `enable*` rule. Without it, the direct-callback path still works.
  - **Backend seam:** `getSocketBackend()`, `setSocketBackend(backend)`, `createWebSocketBackend()`.
- **Close codes:** a small constant set covering the common RFC 6455 codes used by Bronze (`SocketCloseNormal = 1000`, `SocketCloseGoingAway = 1001`, `SocketCloseAbnormal = 1006`).

Effort: small. One source file + colocated test, one types file, web backend over the `WebSocket` global. This is the 80%-value slice.

## Silver

Competitive with a well-regarded WebSocket client library: reconnection, backpressure visibility, heartbeats, queued sends, and the `-formats` codec neighbor.

- **Reconnection (in `@flighthq/types` + `@flighthq/socket`):**
  - `SocketReconnectPolicy` type — `Readonly` `{ maxAttempts: number; baseDelayMs: number; maxDelayMs: number; jitter: boolean }`.
  - `createSocketReconnectPolicy(out?): SocketReconnectPolicy` with sane defaults (exponential backoff + full jitter).
  - `setSocketReconnectPolicy(socket, policy): void`; on unexpected close the entity auto-reopens per policy.
  - `getSocketReconnectAttempt(socket): number`; new signals `onReconnecting(attempt, delayMs)` and `onReconnected()` added to `SocketSignals`.
  - `cancelSocketReconnect(socket): void`.
- **Backpressure:**
  - `getSocketBufferedAmount(socket): number` (mirrors `WebSocket.bufferedAmount`).
  - `SocketBackpressureOptions` — high/low watermarks; `onDrain` and `onBackpressure(bufferedAmount)` signals so a producer can pause/resume. `isSocketWritable(socket): boolean`.
  - Optional outbound queue with cap: `SocketSendQueueOptions { maxQueuedMessages; maxQueuedBytes; dropPolicy: 'dropOldest' | 'dropNewest' | 'reject' }`; `getSocketQueuedCount(socket)`.
- **Heartbeat / liveness:**
  - `SocketHeartbeatOptions` — `{ intervalMs; timeoutMs; pingPayload? }`; `enableSocketHeartbeat(socket, options)`; `onPong`/`onHeartbeatTimeout` signals. (App-level ping/pong over text/binary, since browser `WebSocket` exposes no control-frame API; native backends may use real protocol pings.)
- **Full close-code vocabulary:** the complete RFC 6455 registry as named constants (`SocketClosePolicyViolation = 1008`, `SocketCloseMessageTooBig = 1009`, `SocketCloseInternalError = 1011`, `SocketCloseTlsHandshake = 1015`, …) plus `getSocketCloseCodeName(code): string`.
- **Codec neighbor — `@flighthq/socket-formats`:**
  - `SocketCodec<T>` type in `@flighthq/types` — `{ encode(value: T): string | ArrayBuffer; decode(message: Readonly<SocketMessage>): T }`.
  - `createJsonSocketCodec()`, `createTextLineSocketCodec()` (line-delimited), `createLengthPrefixedSocketCodec()` (binary framing). A typed convenience `sendSocketEncoded(socket, codec, value)` and an `onDecodedMessage` adapter. Stays a neighbor so the core never depends on a serializer.
- **Cross-backend consistency:** documented + tested guarantee that web and native backends agree on `SocketReadyState` transitions, `SocketCloseInfo.wasClean`, and binary delivery as `ArrayBuffer` (never `Blob`) — the parity contract the Rust port checks against.
- **Inspection:** `getSocketUrl(socket)`, `getSocketProtocol(socket)` (negotiated subprotocol), `getSocketExtensions(socket)`.

Effort: medium. Reconnect + backpressure + heartbeat are the load-bearing professional features; the codec split is a small separate package.

## Gold

Authoritative streaming transport — exhaustive, performant, fully tested, Rust 1:1.

- **Transport abstraction beyond WebSocket:** generalize the seam so the same `Socket*` API rides alternative transports via additional backends, selected by `SocketTransportKind` (`'WebSocket' | 'TCP' | 'SSE' | 'WebTransport'`). `createWebSocketBackend()`, `createServerSentEventsBackend()` (receive-only EventSource over the same entity), and native `createTcpSocketBackend()`; `createWebTransportBackend()` for HTTP/3 datagrams+streams. SSE/receive-only transports report `isSocketWritable === false` and `sendSocket*` returns the sentinel — uniform behavior, no special-casing in user code.
- **Multiplexed channels:** `SocketChannel` over one connection — `openSocketChannel(socket, name)`, `sendSocketChannelText/Binary`, per-channel `SocketSignals`, channel-scoped close. Lets one socket carry logically separate streams (the common "rooms"/topics pattern) without N connections.
- **Streaming + flow control:** `SocketReadableStream` / `SocketWritableStream` adapters bridging to the WHATWG Streams API on web (and `futures::Stream` in Rust), giving true async-iterable receive and writer backpressure. `createSocketMessageStream(socket): AsyncIterable<SocketMessage>`.
- **Performance + allocation discipline:** out-parameter receive path (`receiveSocketMessageInto(socket, out: SocketMessage)`), a pooled `SocketMessage` ring (`acquireSocketMessage`/`releaseSocketMessage`) so the hot inbound loop allocates nothing, and zero-copy binary delivery (transfer/borrow the `ArrayBuffer`, documented ownership). Configurable `maxMessageBytes` guard.
- **Robustness / edge cases:** offline-aware reconnect (consume `@flighthq/network` status to gate retries — optional dependency via injection, not a hard import), connection timeout (`SocketOptions.connectTimeoutMs`), idle timeout, graceful drain-then-close (`closeSocketWhenDrained`), redirect/permessage-deflate handling on native, and explicit `SocketError` reason categories (`'timeout' | 'refused' | 'protocol' | 'tls' | 'closedByPeer' | 'aborted'`) surfaced on `onError` rather than opaque strings.
- **Observability:** `SocketMetrics` (`messagesSent/Received`, `bytesSent/Received`, `reconnectCount`, `currentLatencyMs` from heartbeat RTT); `getSocketMetrics(socket, out)`. Optional integration with `@flighthq/log`.
- **Authentication/headers seam:** `SocketOptions.headers` and `SocketOptions.authToken` (honored by native/WebTransport backends; web `WebSocket` cannot set headers, so the web backend documents the subprotocol-token fallback — an honest, documented divergence rather than a silent gap).
- **Tests + docs:** full colocated unit suite incl. aliased `out`-param cases and a deterministic mock `SocketBackend` (shared with `@flighthq/testing` if/when it exists); a functional/integration scenario against a local echo server; documented backend-authoring guide.
- **Rust parity:** `flighthq-socket` with the identical free-function surface (`open_socket`, `send_socket_text`, `send_socket_binary`, `close_socket`, `dispose_socket`, reconnect/backpressure/heartbeat), `SocketBackend` trait, native `tokio-tungstenite` default behind `native`, `host-web` `WebSocket` fill, recorded in the conformance divergence map (notably the header/auth web limitation and SSE receive-only behavior).

Effort: large. Multiplexing, alternative transports, and the streaming/pooled hot path are each substantial; sequence them after Silver has proven the core seam.

## Boundaries

- **Connectivity status stays in `@flighthq/network`.** This package consumes it at Gold (offline-aware reconnect) only by injection, never by hard import — keeping `socket` usable standalone and tree-shakable.
- **One-shot request/response is `@flighthq/http`, not here.** No `fetch`/`URLLoader` surface in `socket`; the two are deliberately separate cells that share vocabulary, not code.
- **Serialization lives in `@flighthq/socket-formats`.** The core transports `string | ArrayBuffer` only; JSON/MessagePack/framing codecs are the neighbor package so the base never pulls a serializer into a user's bundle.
- **No server.** This is a client transport. A WebSocket _server_ is a host/native concern outside the SDK's client-app scope; if ever wanted it is a separate `host-*` or server package.
- **No protocol frameworks.** Socket.IO/STOMP/GraphQL-WS subprotocol layers are application-level adapters built _on_ `socket` + a codec, not part of the transport cell.
- **No auto-registration.** Per the side-effect-free rule, the package never opens a connection or registers a backend at module top level; callers `createSocket` + `openSocket` and opt into signals via `enableSocketSignals`.
- **Scene/serialization persistence is unrelated** — that gap is the separate `@flighthq/scene-format` request.

## Open design questions

- **`socket` vs `websocket` package name.** `socket` matches OpenFL's `Socket`, leaves room for the Gold multi-transport seam (TCP/WebTransport), and pairs cleanly with `http`. `websocket` is more literal but boxes the package into one transport. Recommendation: `socket`. Confirm before scaffolding.
- **Direct callbacks vs signals as the primary receive path.** Bronze offers both (direct callbacks always; signals opt-in via `enableSocketSignals`). Should high-throughput receive _discourage_ signals (per-message dispatch cost) and steer users to the out-param `receiveSocketMessageInto` hot path? Likely document this as the performance guidance rather than removing the signal path.
- **Binary type policy.** Force `binaryType: 'arraybuffer'` always (never `Blob`) for cross-backend determinism and zero-copy, or allow `Blob` on web? Recommendation: `ArrayBuffer` only — `Blob` would break Rust parity and the pooled path.
- **Heartbeat ownership.** App-level ping/pong (works on browser `WebSocket`, which exposes no control frames) vs protocol-level pings on native — this is an intentional behavioral divergence. Should the _payload/cadence_ be standardized so web and native heartbeats are wire-compatible when talking to the same server, or left to the backend? Lean toward a standardized default payload with override.
- **Reconnect identity.** On reconnect, is it the _same_ `Socket` entity (state reset, signals continue) or a new one? Bronze/Silver assume same-entity continuation; confirm this matches how consumers expect to retain listeners across drops.
- **Offline-gating coupling.** Gold's offline-aware reconnect wants `NetworkStatus`. Injection (`setSocketReconnectNetworkSource`) keeps it decoupled but adds surface; a hard optional dependency is simpler but couples two cells. Recommendation: injection.
- **WebTransport scope.** Is HTTP/3 WebTransport in-scope for Gold given uneven platform support, or deferred to a follow-up backend once the seam is proven? Likely deferred but designed-for in `SocketTransportKind`.
