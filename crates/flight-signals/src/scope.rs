use crate::connection::disconnect_signal_connection;
use crate::types::SignalScope;

pub fn create_signal_scope() -> SignalScope {
    let mut out = SignalScope::default();
    initialize_signal_scope(&mut out);
    return out;
}

pub fn initialize_signal_scope(out: &mut SignalScope) {
    *out.connections.write().unwrap() = Vec::new();
}

/// Tears down every tracked connection in the scope and empties it (TS `disconnectSignalScope`).
/// The list is emptied before the loop so a re-entrant call sees nothing to do; each disconnect
/// is idempotent, so a member already torn down through its own handle, a once member that
/// already fired, and a duplicate listing all cost one no-op.
pub fn disconnect_signal_scope(scope: &SignalScope) {
    let pending = {
        let mut connections = scope.connections.write().unwrap();
        if connections.is_empty() {
            return;
        }
        std::mem::take(&mut *connections)
    };
    for connection in &pending {
        disconnect_signal_connection(connection);
    }
}
