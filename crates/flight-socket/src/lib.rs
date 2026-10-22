//! Socket capability seam: framed connection lifecycle, opt-in event signals and raw TCP byte
//! streams, all routed through explicit host providers. No WebSocket, TCP or browser transport
//! lives here; every connection, event sink and stream comes from the caller's host.

mod enable_socket_guards;
mod explain_socket_send_failure;
mod host_explain;
mod socket;
mod socket_sugar;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use. `initialize_socket` and `set_socket_guard` stay contract-only.
pub use contract::are_socket_guards_enabled;
pub use contract::attach_socket;
pub use contract::close_socket;
pub use contract::create_socket;
pub use contract::detach_socket;
pub use contract::disable_socket_guards;
pub use contract::dispose_socket;
pub use contract::enable_socket_guards;
pub use contract::enable_socket_signals;
pub use contract::explain_socket_send_failure;
pub use contract::get_socket_ready_state;
pub use contract::open_tcp_socket;
pub use contract::send_socket_message;

pub use contract::HostSocketCapabilities;
pub use contract::HostSocketCapability;
pub use contract::Socket;
pub use contract::SocketBinaryType;
pub use contract::SocketCloseInfo;
pub use contract::SocketConnection;
pub use contract::SocketEventSink;
pub use contract::SocketGuard;
pub use contract::SocketGuardNotice;
pub use contract::SocketGuardOperation;
pub use contract::SocketGuardReason;
pub use contract::SocketGuardState;
pub use contract::SocketGuardStateMethods;
pub use contract::SocketGuardStateRef;
pub use contract::SocketMessage;
pub use contract::SocketMessageData;
pub use contract::SocketMethods;
pub use contract::SocketOptions;
pub use contract::SocketReadyState;
pub use contract::SocketRuntime;
pub use contract::SocketSendFailureExplanation;
pub use contract::SocketSendFailureReason;
pub use contract::SocketSignals;
pub use contract::TcpSocketConnection;
pub use contract::TcpSocketOptions;
