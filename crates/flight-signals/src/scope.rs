use flight_entity::allocate_entity;

use crate::connection::disconnect_signal_connection;
use crate::types::SignalScope;

pub fn create_signal_scope() -> SignalScope {
    let mut out: SignalScope = allocate_entity();
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
    let Some(pending) = take_signal_scope_connections(scope) else {
        return;
    };
    for connection in &pending {
        disconnect_signal_connection(connection);
    }
}

// Snapshots then empties the shared list in place: the list is shared by every clone of the scope,
// so it is cleared rather than replaced.
fn drain_signal_scope_connections(
    connections: &mut Vec<crate::types::SignalConnection>,
) -> Option<Vec<crate::types::SignalConnection>> {
    if connections.is_empty() {
        return None;
    }
    let mut snapshot: Vec<crate::types::SignalConnection> = Vec::new();
    for connection in connections.iter() {
        snapshot.push(connection.clone());
    }
    connections.clear();
    return Some(snapshot);
}

fn take_signal_scope_connections(
    scope: &SignalScope,
) -> Option<Vec<crate::types::SignalConnection>> {
    let mut connections = scope.connections.write().unwrap();
    return drain_signal_scope_connections(&mut connections);
}
