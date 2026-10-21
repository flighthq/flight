//! Deterministic send-failure diagnosis (TS `explainSocketSendFailure.ts`).

use flight_entity::Ref;

use crate::types::*;

/// Explains the deterministic preflight reasons `send_socket_message` returns false without
/// invoking its backend (TS `explainSocketSendFailure`). Returns `None` when the socket can reach
/// the backend; that backend may still reject the frame with its own false result.
pub fn explain_socket_send_failure(socket: &Ref<Socket>) -> Option<SocketSendFailureExplanation> {
    let current = socket.read().unwrap();
    let runtime = socket_runtime(&current);
    if runtime.disposed {
        return Some(SocketSendFailureExplanation {
            reason: SocketSendFailureReason::Disposed,
            ready_state: SocketReadyState::Closed,
            url: current.url.clone(),
        });
    }
    if runtime.connection.is_none() {
        return Some(SocketSendFailureExplanation {
            reason: SocketSendFailureReason::NoConnection,
            ready_state: runtime.ready_state,
            url: current.url.clone(),
        });
    }
    if runtime.ready_state != SocketReadyState::Open {
        return Some(SocketSendFailureExplanation {
            reason: SocketSendFailureReason::NotOpen,
            ready_state: runtime.ready_state,
            url: current.url.clone(),
        });
    }
    return None;
}
