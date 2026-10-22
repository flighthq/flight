//! The framed socket lifecycle: allocation, connection commands, delivery gating and the
//! provider-to-entity event sink (TS `socket.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity, attach_entity_binding};
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

/// Allocates a socket entity plus its runtime and opens the connection through the host provider,
/// wiring the provider's open/message/close/error into the socket's still-inert signal group (TS
/// `createSocket`). The socket starts in `connecting` and is left attached (delivering). A host that
/// carries no socket transport yields no connection and the socket stays in `connecting` until
/// closed; absence is an answer here, never a process-global fallback. D23: a provider construction
/// seam (Principal 06d7a025): `options` is the provider's open request and `url` stays required.
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level guard hook
pub fn create_socket(
    guard_state: &SocketGuardStateRef,
    host_socket: Option<&HostSocketCapability>,
    options: &SocketOptions,
) -> Ref<Socket> {
    let mut out: Socket = allocate_entity();
    out.url = options.url.clone();
    initialize_socket(&mut out);
    let socket = Arc::new(RwLock::new(out));
    let events = make_socket_event_sink(&socket);
    let connection = match host_socket {
        Some(host) => open_socket(host, options, &events),
        None => None,
    };
    {
        let mut current = socket.write().unwrap();
        socket_runtime_mut(&mut current).connection = connection;
    }
    let no_connection = {
        let current = socket.read().unwrap();
        socket_runtime(&current).connection.is_none()
    };
    if no_connection {
        emit_socket_guard_notice(
            guard_state,
            SocketGuardNotice {
                operation: SocketGuardOperation::CreateSocket,
                reason: SocketGuardReason::NoConnection,
                socket: socket.clone(),
            },
        );
    }
    return socket;
}

/// Gives a socket under construction its `connecting` runtime, attached before the provider is
/// called so a synchronous provider event already observes live state (D12 initializer).
// flight-lint: allow(conform-extra) D12: Socket extends Entity but the pinned TS package exposes no initializeSocket
pub fn initialize_socket(out: &mut Socket) {
    attach_entity_binding(
        out,
        Box::new(SocketRuntime {
            connection: None,
            signals: None,
            ready_state: SocketReadyState::Connecting,
            delivering: true,
            disposed: false,
        }),
    );
}

/// Resumes delivery of provider events to the socket's signals (TS `attachSocket`). Idempotent; a
/// disposed socket is terminal and cannot be reattached.
pub fn attach_socket(socket: &Ref<Socket>) {
    let mut current = socket.write().unwrap();
    let runtime = socket_runtime_mut(&mut current);
    if runtime.disposed {
        return;
    }
    runtime.delivering = true;
}

/// Begins a clean close of the live connection (TS `closeSocket`). Transitions `connecting`/`open`
/// to `closing`; the provider's close event later transitions to `closed`. A no-op when already
/// closing or closed, and a guarded no-op on a disposed socket.
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level guard hook
pub fn close_socket(
    guard_state: &SocketGuardStateRef,
    socket: &Ref<Socket>,
    code: Option<i32>,
    reason: Option<&str>,
) {
    let (disposed, connection) = {
        let mut current = socket.write().unwrap();
        let runtime = socket_runtime_mut(&mut current);
        if runtime.disposed {
            (true, None)
        } else if runtime.ready_state == SocketReadyState::Closing
            || runtime.ready_state == SocketReadyState::Closed
        {
            (false, None)
        } else {
            runtime.ready_state = SocketReadyState::Closing;
            (false, runtime.connection.clone())
        }
    };
    if disposed {
        emit_socket_guard_notice(
            guard_state,
            SocketGuardNotice {
                operation: SocketGuardOperation::CloseSocket,
                reason: SocketGuardReason::Disposed,
                socket: socket.clone(),
            },
        );
        return;
    }
    if let Some(connection) = connection {
        (connection.close_socket_connection)(code, reason);
    }
}

/// Begins a connection's closing handshake through its stored provider callback (TS
/// `SocketConnection.closeSocketConnection`). The optional code and reason are forwarded unchanged.
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `SocketConnection` method, not a free function
pub fn close_socket_connection(
    connection: &SocketConnection,
    code: Option<i32>,
    reason: Option<&str>,
) {
    return (connection.close_socket_connection)(code, reason);
}

/// Closes a raw TCP connection through its stored provider callback (TS
/// `TcpSocketConnection.closeTcpSocketConnection`).
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `TcpSocketConnection` method, not a free function
pub fn close_tcp_socket_connection(connection: &TcpSocketConnection) {
    return (connection.close_tcp_socket_connection)();
}

/// Stops delivery of provider events to the socket's signals (TS `detachSocket`). The live
/// connection is untouched; resume with `attach_socket`.
pub fn detach_socket(socket: &Ref<Socket>) {
    let mut current = socket.write().unwrap();
    socket_runtime_mut(&mut current).delivering = false;
}

/// Releases the socket to garbage collection (TS `disposeSocket`): closes the live connection if
/// still open, stops delivery, drops the signal group and marks the entity terminal.
pub fn dispose_socket(socket: &Ref<Socket>) {
    let (disposed, connection) = {
        let mut current = socket.write().unwrap();
        let runtime = socket_runtime_mut(&mut current);
        if runtime.disposed {
            (true, None)
        } else if runtime.ready_state == SocketReadyState::Closing
            || runtime.ready_state == SocketReadyState::Closed
        {
            (false, None)
        } else {
            runtime.ready_state = SocketReadyState::Closing;
            (false, runtime.connection.clone())
        }
    };
    if disposed {
        return;
    }
    if let Some(connection) = connection {
        (connection.close_socket_connection)(None, None);
    }
    let mut current = socket.write().unwrap();
    let runtime = socket_runtime_mut(&mut current);
    runtime.delivering = false;
    runtime.connection = None;
    runtime.signals = None;
    runtime.ready_state = SocketReadyState::Closed;
    runtime.disposed = true;
}

/// Invokes the caller-owned guard hook, if one is installed (never while holding a socket lock, so
/// a guard may re-enter the lifecycle functions).
fn emit_socket_guard_notice(guard_state: &SocketGuardStateRef, notice: SocketGuardNotice) {
    let guard = {
        let current = guard_state.read().unwrap();
        current.guard.clone()
    };
    if let Some(guard) = guard {
        guard(&notice);
    }
}

/// Opts the socket into its typed event signals (TS `enableSocketSignals`), allocating the group on
/// first call and returning the same shared group afterwards. A disposed socket still returns a
/// stable inert group so the return shape is unchanged.
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level guard hook
pub fn enable_socket_signals(
    guard_state: &SocketGuardStateRef,
    socket: &Ref<Socket>,
) -> Ref<SocketSignals> {
    let disposed = {
        let current = socket.read().unwrap();
        socket_runtime(&current).disposed
    };
    if disposed {
        emit_socket_guard_notice(
            guard_state,
            SocketGuardNotice {
                operation: SocketGuardOperation::EnableSocketSignals,
                reason: SocketGuardReason::Disposed,
                socket: socket.clone(),
            },
        );
    }
    let mut current = socket.write().unwrap();
    let runtime = socket_runtime_mut(&mut current);
    if runtime.signals.is_none() {
        let mut out: SocketSignals = allocate_entity();
        out.on_socket_open = create_signal();
        out.on_socket_message = create_signal();
        out.on_socket_close = create_signal();
        out.on_socket_error = create_signal();
        runtime.signals = Some(Arc::new(RwLock::new(out)));
    }
    return runtime
        .signals
        .as_ref()
        .expect("socket signals are present")
        .clone();
}

/// The socket's current connection phase (TS `getSocketReadyState`), tracked on the runtime from
/// provider events and the close command.
pub fn get_socket_ready_state(socket: &Ref<Socket>) -> SocketReadyState {
    let current = socket.read().unwrap();
    return socket_runtime(&current).ready_state;
}

/// Delivers a close event through a sink's stored callback (TS `SocketEventSink.handleSocketClose`).
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `SocketEventSink` method, not a free function
pub fn handle_socket_close(sink: &SocketEventSink, info: &SocketCloseInfo) {
    return (sink.handle_socket_close)(info);
}

/// Delivers an error event through a sink's stored callback (TS `SocketEventSink.handleSocketError`).
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `SocketEventSink` method, not a free function
pub fn handle_socket_error(sink: &SocketEventSink) {
    return (sink.handle_socket_error)();
}

/// Delivers one frame through a sink's stored callback (TS `SocketEventSink.handleSocketMessage`).
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `SocketEventSink` method, not a free function
pub fn handle_socket_message(sink: &SocketEventSink, message: &SocketMessage) {
    return (sink.handle_socket_message)(message);
}

/// Delivers an open event through a sink's stored callback (TS `SocketEventSink.handleSocketOpen`).
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `SocketEventSink` method, not a free function
pub fn handle_socket_open(sink: &SocketEventSink) {
    return (sink.handle_socket_open)();
}

/// Builds the provider-to-entity sink bound to one socket (TS `makeSocketEventSink`). Every handler
/// is a no-op once the runtime stops delivering, so a late provider event after detach or dispose
/// fires nothing. State is updated before the signal emits, so a listener re-entering the lifecycle
/// functions sees the new phase.
fn make_socket_event_sink(socket: &Ref<Socket>) -> SocketEventSink {
    let open_socket = socket.clone();
    let message_socket = socket.clone();
    let close_socket_target = socket.clone();
    let error_socket = socket.clone();
    return SocketEventSink {
        handle_socket_open: Arc::new(move || {
            let signals = {
                let mut current = open_socket.write().unwrap();
                let runtime = socket_runtime_mut(&mut current);
                if !runtime.delivering {
                    return;
                }
                runtime.ready_state = SocketReadyState::Open;
                runtime.signals.clone()
            };
            if let Some(signals) = signals {
                let signal = signals.read().unwrap().on_socket_open.clone();
                emit_signal(&signal, &());
            }
        }),
        handle_socket_message: Arc::new(move |message: &SocketMessage| {
            let signals = {
                let current = message_socket.read().unwrap();
                let runtime = socket_runtime(&current);
                if !runtime.delivering {
                    return;
                }
                runtime.signals.clone()
            };
            if let Some(signals) = signals {
                let signal = signals.read().unwrap().on_socket_message.clone();
                emit_signal(&signal, message);
            }
        }),
        handle_socket_close: Arc::new(move |info: &SocketCloseInfo| {
            let signals = {
                let mut current = close_socket_target.write().unwrap();
                let runtime = socket_runtime_mut(&mut current);
                if !runtime.delivering {
                    return;
                }
                runtime.ready_state = SocketReadyState::Closed;
                runtime.signals.clone()
            };
            if let Some(signals) = signals {
                let signal = signals.read().unwrap().on_socket_close.clone();
                emit_signal(&signal, info);
            }
        }),
        handle_socket_error: Arc::new(move || {
            let signals = {
                let current = error_socket.read().unwrap();
                let runtime = socket_runtime(&current);
                if !runtime.delivering {
                    return;
                }
                runtime.signals.clone()
            };
            if let Some(signals) = signals {
                let signal = signals.read().unwrap().on_socket_error.clone();
                emit_signal(&signal, &());
            }
        }),
    };
}

/// Opens a framed connection through the supplied provider, wiring its open/message/close/error
/// into the supplied sink (TS `HostSocketCapability.openSocket`).
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `HostSocketCapability` method, not a free function
pub fn open_socket(
    host_socket: &HostSocketCapability,
    options: &SocketOptions,
    events: &SocketEventSink,
) -> Option<SocketConnection> {
    let open_socket = host_socket.open_socket.clone();
    return open_socket(options, events);
}

/// Opens a raw TCP byte stream through the socket provider selected by the caller's host (TS
/// `openTcpSocket`). A framed-only provider omits `open_tcp_socket`, so unsupported raw TCP returns
/// null without trying `open_socket` or reinterpreting the endpoint as a WebSocket URL.
pub fn open_tcp_socket(
    host_socket: Option<&HostSocketCapability>,
    options: &TcpSocketOptions,
) -> Option<TcpSocketConnection> {
    let host = host_socket?;
    let open_tcp_socket = host.open_tcp_socket.as_ref()?.clone();
    return open_tcp_socket(options);
}

/// Sends one frame through a live connection's stored provider callback (TS
/// `SocketConnection.sendSocketFrame`). The payload is borrowed, never copied or mutated.
// flight-lint: allow(conform-extra) D18: the source declares this operation as a `SocketConnection` method, not a free function
pub fn send_socket_frame(connection: &SocketConnection, data: &SocketMessageData) -> bool {
    return (connection.send_socket_frame)(data);
}

/// Sends a text or binary frame over the live connection without mutating or copying the payload
/// (TS `sendSocketMessage`). Returns false — a sentinel, not a throw — when the socket is disposed,
/// not open, has no connection, or the provider rejects the send.
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level guard hook
pub fn send_socket_message(
    guard_state: &SocketGuardStateRef,
    socket: &Ref<Socket>,
    data: &SocketMessageData,
) -> bool {
    let (disposed, connection) = {
        let current = socket.read().unwrap();
        let runtime = socket_runtime(&current);
        if runtime.disposed {
            (true, None)
        } else if runtime.ready_state != SocketReadyState::Open {
            (false, None)
        } else {
            (false, runtime.connection.clone())
        }
    };
    if disposed {
        emit_socket_guard_notice(
            guard_state,
            SocketGuardNotice {
                operation: SocketGuardOperation::SendSocketMessage,
                reason: SocketGuardReason::Disposed,
                socket: socket.clone(),
            },
        );
        return false;
    }
    let Some(connection) = connection else {
        return false;
    };
    return (connection.send_socket_frame)(data);
}

/// Installs the diagnostics hook used by the separately imported guard module (TS
/// `setSocketGuard`). The caller owns the state record; an installed custom hook does not change
/// the enabled flag, exactly as the source's `_guard` and `_enabled` stay independent.
// flight-lint: allow(conform-params) D5: caller-owned SocketGuardState replaces the source module-level guard hook
pub fn set_socket_guard(guard_state: &SocketGuardStateRef, guard: Option<SocketGuard>) {
    let mut current = guard_state.write().unwrap();
    current.guard = guard;
}
