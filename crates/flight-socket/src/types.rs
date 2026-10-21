//! The socket contract types: framed connection lifecycle, opt-in signal group, raw TCP byte
//! streams and the swappable host transport seam (TS `types/src/Socket.ts`).

use std::sync::Arc;

use flight_buffer::ArrayBuffer;
use flight_entity::{Entity, EntityRuntimeSlot, Ref, get_entity_binding_as};
use flight_hostcapability::ProviderRef;
use flight_signals::Signal;
use flight_stream::{ReadableStream, WritableStream};

/// The four WebSocket-standard connection phases (TS `SocketReadyState`), a closed string union.
/// Read through `get_socket_ready_state`; driven by the backend through the event sink plus the
/// explicit close command.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SocketReadyState {
    Connecting,
    Open,
    Closing,
    Closed,
}

/// The only supported binary delivery kind (TS `SocketOptions.binaryType`: `'arraybuffer'`), a
/// closed string union with one member.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SocketBinaryType {
    ArrayBuffer,
}

/// One framed payload (TS `SocketMessage.data`: `string | ArrayBuffer`). `Text` is the string arm
/// and `Binary` the canonical `ArrayBuffer` arm (shared fixed-length storage, cloned by identity);
/// the owning `SocketMessage.binary` flag mirrors the variant.
#[derive(Clone, Debug)]
pub enum SocketMessageData {
    Text(String),
    Binary(ArrayBuffer),
}

/// One received frame (TS `SocketMessage`). `binary` is false for a text frame (`data` is the string
/// arm) and true for a binary frame (the byte-buffer arm), so a consumer never type-sniffs the data.
#[derive(Clone, Debug)]
pub struct SocketMessage {
    pub data: SocketMessageData,
    pub binary: bool,
}

/// Inputs to `create_socket` (TS `SocketOptions`). Only `url` is required; `protocols` requests
/// WebSocket subprotocols and `binary_type` selects how binary frames are delivered.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SocketOptions {
    pub url: String,
    pub protocols: Option<Vec<String>>,
    pub binary_type: Option<SocketBinaryType>,
}

/// Carried by `on_socket_close` (TS `SocketCloseInfo`): the WebSocket close code, the human-readable
/// reason, and whether the closing handshake completed cleanly.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SocketCloseInfo {
    pub code: i32,
    pub reason: String,
    pub was_clean: bool,
}

/// A live, opened connection handle owned by the backend (TS `SocketConnection`). Socket sends and
/// closes through it; the backend wires transport events into the sink passed to `open_socket`.
/// The two fields are the source interface's two methods, stored in the D9 callback form.
#[derive(Clone)]
pub struct SocketConnection {
    pub send_socket_frame: Arc<dyn Fn(&SocketMessageData) -> bool + Send + Sync>,
    pub close_socket_connection: Arc<dyn Fn(Option<i32>, Option<&str>) + Send + Sync>,
}

/// The backend-to-entity event sink (TS `SocketEventSink`). Split per event kind so the backend can
/// carry each event's payload, exactly as the source passes its listener object to the provider.
#[derive(Clone)]
pub struct SocketEventSink {
    pub handle_socket_open: Arc<dyn Fn() + Send + Sync>,
    pub handle_socket_message: Arc<dyn Fn(&SocketMessage) + Send + Sync>,
    pub handle_socket_close: Arc<dyn Fn(&SocketCloseInfo) + Send + Sync>,
    pub handle_socket_error: Arc<dyn Fn() + Send + Sync>,
}

/// A raw TCP endpoint (TS `TcpSocketOptions`). It deliberately has no URL, protocols, binary-type
/// selection or frame options: a TCP connection is a byte stream, not a framed message transport.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TcpSocketOptions {
    pub host: String,
    pub port: i32,
}

/// A live raw TCP connection owned by the backend (TS `TcpSocketConnection`). Incoming and outgoing
/// bytes remain canonical D20 streams so a provider can preserve ordering and backpressure without
/// inventing WebSocket frame boundaries.
pub struct TcpSocketConnection {
    pub readable: ReadableStream,
    pub writable: WritableStream,
    pub close_tcp_socket_connection: Arc<dyn Fn() + Send + Sync>,
}

/// The swappable transport seam realized by the web default and by native hosts (TS
/// `HostSocketCapability`). `open_socket` opens a framed connection and wires the transport's
/// events into the supplied sink. Omitting `open_tcp_socket` means raw TCP is unsupported.
#[derive(Clone)]
pub struct HostSocketCapability {
    pub provider: ProviderRef,
    pub open_socket:
        Arc<dyn Fn(&SocketOptions, &SocketEventSink) -> Option<SocketConnection> + Send + Sync>,
    pub open_tcp_socket:
        Option<Arc<dyn Fn(&TcpSocketOptions) -> Option<TcpSocketConnection> + Send + Sync>>,
}

/// The socket capability group (TS `HostSocketCapabilities`). An omitted slot is capability
/// absence, never a process-global fallback.
#[derive(Clone, Default)]
pub struct HostSocketCapabilities {
    pub connection: Option<HostSocketCapability>,
}

/// Opaque per-socket runtime (TS `SocketRuntime`): the live connection, the opt-in signal group,
/// the current ready state and the delivery flag. The source marks it internal and touches it only
/// from lifecycle functions; Rust stores it in the entity runtime binding so it stays private to
/// this crate while remaining explicit per-socket state (D5, no module singleton).
#[derive(Clone)]
pub struct SocketRuntime {
    pub connection: Option<SocketConnection>,
    pub signals: Option<Ref<SocketSignals>>,
    pub ready_state: SocketReadyState,
    /// False stops backend events from reaching the signals (set by detach and dispose).
    pub delivering: bool,
    /// True is the terminal entity state; disposal cannot be reversed by attach.
    pub disposed: bool,
}

/// Persistent-connection transport entity (TS `Socket`, an Entity). `url` is the requested endpoint;
/// all live state lives on the private runtime binding. Create with `create_socket`, observe via
/// `enable_socket_signals`, send with `send_socket_message`, and tear down with `close_socket` (the
/// connection) then `dispose_socket` (the entity).
#[derive(Default)]
pub struct Socket {
    runtime: EntityRuntimeSlot,
    pub url: String,
}

/// The opt-in event group (TS `SocketSignals`, an Entity), allocated lazily by
/// `enable_socket_signals`. A bare socket keeps no group and pays no signal allocation or dispatch
/// cost.
#[derive(Default)]
pub struct SocketSignals {
    runtime: EntityRuntimeSlot,
    pub on_socket_open: Signal<()>,
    pub on_socket_message: Signal<SocketMessage>,
    pub on_socket_close: Signal<SocketCloseInfo>,
    pub on_socket_error: Signal<()>,
}

/// The deterministic preflight reason a send returned false (TS `SocketSendFailureExplanation`'s
/// discriminant), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SocketSendFailureReason {
    Disposed,
    NoConnection,
    NotOpen,
}

/// Plain-data diagnosis for `send_socket_message`'s deterministic false paths (TS
/// `SocketSendFailureExplanation`). All three source variants carry the same `reason`, `readyState`
/// and `url` fields and differ only in the reason literal and the narrowed ready-state domain, so
/// one record with an explicit reason enum represents the union.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SocketSendFailureExplanation {
    pub reason: SocketSendFailureReason,
    pub ready_state: SocketReadyState,
    pub url: String,
}

/// The optional misuse hook (TS `SocketGuard`). Null is the production default; the guard module
/// installs an implementation and the core lifecycle functions branch before doing guard work.
pub type SocketGuard = Arc<dyn Fn(&SocketGuardNotice) + Send + Sync>;

/// The lifecycle function that emitted a guard notice (TS `SocketGuardNotice.operation`), a closed
/// string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SocketGuardOperation {
    CreateSocket,
    CloseSocket,
    EnableSocketSignals,
    SendSocketMessage,
}

/// The reason a guard notice was emitted (TS `SocketGuardNotice.reason`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SocketGuardReason {
    NoConnection,
    Disposed,
}

/// The notice emitted through the optional guard hook (TS `SocketGuardNotice`). The socket is
/// carried by shared handle so the guard reads its `url` without copying the entity.
#[derive(Clone)]
pub struct SocketGuardNotice {
    pub operation: SocketGuardOperation,
    pub reason: SocketGuardReason,
    pub socket: Ref<Socket>,
}

/// Caller-owned replacement for the source's module-level `_guard` and `_enabled` (D5). The core
/// lifecycle functions take it explicitly, so no process-global hook or thread-local state exists.
#[derive(Default)]
pub struct SocketGuardState {
    pub guard: Option<SocketGuard>,
    pub enabled: bool,
}

/// Shared caller-owned guard state.
pub type SocketGuardStateRef = Ref<SocketGuardState>;

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `SocketBinaryType` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn get_socket_binary_type_string(value: SocketBinaryType) -> &'static str {
    return match value {
        SocketBinaryType::ArrayBuffer => "arraybuffer",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `SocketGuardOperation` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn get_socket_guard_operation_string(value: SocketGuardOperation) -> &'static str {
    return match value {
        SocketGuardOperation::CreateSocket => "createSocket",
        SocketGuardOperation::CloseSocket => "closeSocket",
        SocketGuardOperation::EnableSocketSignals => "enableSocketSignals",
        SocketGuardOperation::SendSocketMessage => "sendSocketMessage",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `SocketGuardReason` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn get_socket_guard_reason_string(value: SocketGuardReason) -> &'static str {
    return match value {
        SocketGuardReason::NoConnection => "no-connection",
        SocketGuardReason::Disposed => "disposed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `SocketReadyState` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn get_socket_ready_state_string(value: SocketReadyState) -> &'static str {
    return match value {
        SocketReadyState::Connecting => "connecting",
        SocketReadyState::Open => "open",
        SocketReadyState::Closing => "closing",
        SocketReadyState::Closed => "closed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `SocketSendFailureExplanation` reason union; the pinned TS package exports no get_/parse_ free functions
pub fn get_socket_send_failure_reason_string(value: SocketSendFailureReason) -> &'static str {
    return match value {
        SocketSendFailureReason::Disposed => "disposed",
        SocketSendFailureReason::NoConnection => "no-connection",
        SocketSendFailureReason::NotOpen => "not-open",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `SocketBinaryType` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn parse_socket_binary_type(value: &str) -> Option<SocketBinaryType> {
    return match value {
        "arraybuffer" => Some(SocketBinaryType::ArrayBuffer),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `SocketGuardOperation` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn parse_socket_guard_operation(value: &str) -> Option<SocketGuardOperation> {
    return match value {
        "createSocket" => Some(SocketGuardOperation::CreateSocket),
        "closeSocket" => Some(SocketGuardOperation::CloseSocket),
        "enableSocketSignals" => Some(SocketGuardOperation::EnableSocketSignals),
        "sendSocketMessage" => Some(SocketGuardOperation::SendSocketMessage),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `SocketGuardReason` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn parse_socket_guard_reason(value: &str) -> Option<SocketGuardReason> {
    return match value {
        "no-connection" => Some(SocketGuardReason::NoConnection),
        "disposed" => Some(SocketGuardReason::Disposed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `SocketReadyState` literal union; the pinned TS package exports no get_/parse_ free functions
pub fn parse_socket_ready_state(value: &str) -> Option<SocketReadyState> {
    return match value {
        "connecting" => Some(SocketReadyState::Connecting),
        "open" => Some(SocketReadyState::Open),
        "closing" => Some(SocketReadyState::Closing),
        "closed" => Some(SocketReadyState::Closed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `SocketSendFailureExplanation` reason union; the pinned TS package exports no get_/parse_ free functions
pub fn parse_socket_send_failure_reason(value: &str) -> Option<SocketSendFailureReason> {
    return match value {
        "disposed" => Some(SocketSendFailureReason::Disposed),
        "no-connection" => Some(SocketSendFailureReason::NoConnection),
        "not-open" => Some(SocketSendFailureReason::NotOpen),
        _ => None,
    };
}

/// Reads the per-socket runtime binding (D5: explicit per-entity state, never a module map).
pub(crate) fn socket_runtime(socket: &Socket) -> &SocketRuntime {
    return get_entity_binding_as::<SocketRuntime, Socket>(socket)
        .expect("socket runtime is attached by initialize_socket");
}

/// Mutably reads the per-socket runtime binding.
pub(crate) fn socket_runtime_mut(socket: &mut Socket) -> &mut SocketRuntime {
    return socket
        .entity_runtime_mut()
        .data
        .as_mut()
        .expect("socket runtime slot is allocated")
        .binding
        .as_mut()
        .expect("socket runtime binding is attached")
        .downcast_mut::<SocketRuntime>()
        .expect("socket runtime binding carries a SocketRuntime");
}

flight_entity::impl_entity!(Socket);
flight_entity::impl_entity!(SocketSignals);
