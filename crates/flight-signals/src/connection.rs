use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use crate::slot::{connect_signal, disconnect_signal};
use crate::types::{
    Signal, SignalConnectOptions, SignalConnection, SignalConnectionHandle, SignalScope,
    SignalTrackedConnectOptions, SlotFn,
};

pub fn connect_signal_tracked(
    signal: &Signal,
    slot: SlotFn,
    options: Option<&SignalTrackedConnectOptions>,
    scope: Option<&SignalScope>,
) -> SignalConnectionHandle {
    let once = options.map_or(false, |o| o.once);

    let connection: SignalConnectionHandle = Rc::new(RefCell::new(SignalConnection {
        connected: true,
        paused: false,
        signal: signal.clone(),
        slot: slot.clone(),
    }));

    let conn_for_wrapper = connection.clone();
    let original_slot = slot;
    let tracked_slot: SlotFn = Rc::new(move |args: Rc<dyn Any>| {
        let paused = conn_for_wrapper.borrow().paused;
        if paused {
            return;
        }
        if once {
            disconnect_signal_connection(&conn_for_wrapper);
        }
        original_slot(args);
    });

    connection.borrow_mut().slot = tracked_slot.clone();

    let priority = options.and_then(|o| o.priority);
    let connect_opts = priority.map(|p| SignalConnectOptions {
        priority: p,
        once: false,
    });
    connect_signal(signal, tracked_slot, connect_opts.as_ref());

    if let Some(scope) = scope {
        scope.connections.borrow_mut().push(connection.clone());
    }

    return connection;
}

pub fn disconnect_signal_connection(connection: &SignalConnectionHandle) {
    let (was_connected, signal, slot) = {
        let mut conn = connection.borrow_mut();
        if !conn.connected {
            return;
        }
        conn.connected = false;
        (true, conn.signal.clone(), conn.slot.clone())
    };
    if was_connected {
        disconnect_signal(&signal, &slot);
    }
}

pub fn pause_signal_connection(connection: &SignalConnectionHandle) {
    let mut conn = connection.borrow_mut();
    if conn.connected {
        conn.paused = true;
    }
}

pub fn resume_signal_connection(connection: &SignalConnectionHandle) {
    let mut conn = connection.borrow_mut();
    if conn.connected {
        conn.paused = false;
    }
}
