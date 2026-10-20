use crate::connection::disconnect_signal_connection;
use crate::types::SignalScope;

pub fn create_signal_scope() -> SignalScope {
    let mut out = SignalScope::default();
    initialize_signal_scope(&mut out);
    return out;
}

pub fn disconnect_signal_scope(scope: &SignalScope) {
    let members = {
        let mut connections = scope.connections.borrow_mut();
        if connections.is_empty() {
            return;
        }
        let pending = connections.clone();
        connections.clear();
        pending
    };
    for i in 0..members.len() {
        // Idempotent per handle: a member already torn down through its own handle,
        // a once member that already fired, and a duplicate listing all cost one early
        // return rather than a second removal.
        disconnect_signal_connection(&members[i]);
    }
}

pub fn initialize_signal_scope(out: &mut SignalScope) {
    *out.connections.borrow_mut() = Vec::new();
}
