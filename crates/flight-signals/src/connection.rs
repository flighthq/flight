use std::sync::Arc;
use std::sync::RwLock;

use crate::slot::{connect_signal, is_slot_connected_in, remove_signal_slot, set_slot_paused_in};
use crate::types::{
    Signal, SignalConnectOptions, SignalConnection, SignalSlot, SignalTrackedConnectOptions,
};

/// Connects a tracked registration and returns a handle for it (TS `connectSignalTracked`).
/// The optional scope is part of the options, matching TS.
pub fn connect_signal_tracked<T: 'static>(
    signal: &Signal<T>,
    slot: SignalSlot<T>,
    options: Option<&SignalTrackedConnectOptions>,
) -> SignalConnection {
    let priority = options.and_then(|o| o.priority);
    let once = options.and_then(|o| o.once).unwrap_or(false);
    let connect_options = SignalConnectOptions {
        priority,
        once: Some(once),
    };
    let id = connect_signal(signal, slot, Some(&connect_options));

    // The handle reaches the registration state weakly: a retained connection never keeps the
    // signal alive, and once the last signal handle drops, every operation is a no-op and
    // `is_connected` reports false.
    let disconnect_data = Arc::downgrade(&signal.data);
    let pause_data = disconnect_data.clone();
    let connected_data = disconnect_data.clone();
    let connection = SignalConnection {
        disconnect: Arc::new(move || {
            let Some(data) = disconnect_data.upgrade() else {
                return;
            };
            let removed = remove_signal_slot(&data, None, id);
            drop(removed);
        }),
        set_paused: Arc::new(move |paused| {
            if let Some(data) = pause_data.upgrade() {
                set_slot_paused_in(&data, id, paused);
            }
        }),
        is_connected: Arc::new(move || {
            connected_data
                .upgrade()
                .is_some_and(|data| is_slot_connected_in(&data, id))
        }),
        paused: Arc::new(RwLock::new(false)),
    };

    if let Some(scope) = options.and_then(|o| o.scope.as_ref()) {
        scope.connections.write().unwrap().push(connection.clone());
    }
    return connection;
}

pub fn disconnect_signal_connection(connection: &SignalConnection) {
    (connection.disconnect)();
}

// flight-lint: allow(conform-extra) D4: Rust exposes handle state through free functions; TS reads handle fields
pub fn is_signal_connection_connected(connection: &SignalConnection) -> bool {
    return (connection.is_connected)();
}

/// True while the connection is paused. A torn-down connection keeps its last paused flag, as in
/// TS, so resuming it cannot appear to bring it back.
// flight-lint: allow(conform-extra) D4: Rust exposes handle state through free functions; TS reads handle fields
pub fn is_signal_connection_paused(connection: &SignalConnection) -> bool {
    return *connection.paused.read().unwrap();
}

pub fn pause_signal_connection(connection: &SignalConnection) {
    if !(connection.is_connected)() {
        return;
    }
    (connection.set_paused)(true);
    *connection.paused.write().unwrap() = true;
}

pub fn resume_signal_connection(connection: &SignalConnection) {
    (connection.set_paused)(false);
    if (connection.is_connected)() {
        *connection.paused.write().unwrap() = false;
    }
}
