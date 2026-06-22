use std::sync::{Arc, Mutex, Weak};

use crate::emitter::{
    SignalCallback, SignalConnectOptions, SignalEmitter, SlotId, emitter_connect_raw,
};
use crate::signal::Signal;

/// RAII guard for a signal connection. Disconnects the listener automatically
/// when dropped.
///
/// Obtained from [`connect_signal`] or [`connect_signal_once`]. Dropping the
/// `SlotGuard` before the signal is destroyed disconnects the listener;
/// dropping it after the signal is destroyed is a no-op.
pub struct SlotGuard<T: 'static> {
    id: SlotId,
    emitter: Weak<Mutex<SignalEmitter<T>>>,
}

impl<T: 'static> SlotGuard<T> {
    pub(crate) fn new(id: SlotId, emitter: &Arc<Mutex<SignalEmitter<T>>>) -> Self {
        Self {
            id,
            emitter: Arc::downgrade(emitter),
        }
    }

    /// Returns the [`SlotId`] for this connection. Useful with
    /// [`is_slot_connected`](crate::emitter::is_slot_connected).
    pub fn id(&self) -> SlotId {
        self.id
    }

    /// Explicitly disconnects this slot. Equivalent to dropping the guard.
    pub fn disconnect(self) {
        // The `drop` impl handles disconnection.
    }
}

impl<T: 'static> Drop for SlotGuard<T> {
    fn drop(&mut self) {
        if let Some(arc) = self.emitter.upgrade() {
            arc.lock().unwrap().disconnect_by_id(self.id);
        }
    }
}

// ---- Free functions -------------------------------------------------------

/// Connects `callback` to `signal` with the given options and returns a
/// [`SlotGuard`] that disconnects automatically on drop.
///
/// # Example
///
/// ```rust
/// use std::sync::Arc;
/// use flighthq_signals::{Signal, connect_signal, emit_signal, SignalConnectOptions};
///
/// let sig: Signal<i32> = Signal::new();
/// let _guard = connect_signal(
///     &sig,
///     Arc::new(|v: &i32| println!("{v}")),
///     Default::default(),
/// );
/// emit_signal(&sig, &7);
/// ```
pub fn connect_signal<T: 'static>(
    signal: &Signal<T>,
    callback: SignalCallback<T>,
    options: SignalConnectOptions,
) -> SlotGuard<T> {
    let id = emitter_connect_raw(&signal.emitter, callback, options);
    SlotGuard::new(id, &signal.emitter)
}

/// Connects a one-shot `callback` to `signal`: fires once then disconnects
/// automatically. Equivalent to `connect_signal` with `once: true`.
pub fn connect_signal_once<T: 'static>(
    signal: &Signal<T>,
    callback: SignalCallback<T>,
) -> SlotGuard<T> {
    connect_signal(
        signal,
        callback,
        SignalConnectOptions {
            once: true,
            priority: 0,
        },
    )
}

/// Disconnects `slot_id` from `signal`. Prefer dropping the [`SlotGuard`]
/// when possible; this free function is for cases where the id was captured
/// separately.
pub fn disconnect_signal<T: 'static>(signal: &Signal<T>, slot_id: SlotId) {
    signal.emitter.lock().unwrap().disconnect_by_id(slot_id);
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::emitter::emit_signal;
    use crate::signal::Signal;

    // --- connect_signal ---

    #[test]
    fn connect_signal_fires_on_emit() {
        let sig: Signal<()> = Signal::new();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _slot = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn connect_signal_priority_order() {
        let sig: Signal<()> = Signal::new();
        let order = Arc::new(Mutex::new(Vec::<i32>::new()));

        let o1 = Arc::clone(&order);
        let _s1 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                o1.lock().unwrap().push(1);
            }),
            SignalConnectOptions {
                priority: 5,
                ..Default::default()
            },
        );

        let o2 = Arc::clone(&order);
        let _s2 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                o2.lock().unwrap().push(2);
            }),
            SignalConnectOptions {
                priority: 10,
                ..Default::default()
            },
        );

        let o3 = Arc::clone(&order);
        let _s3 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                o3.lock().unwrap().push(3);
            }),
            SignalConnectOptions {
                priority: 0,
                ..Default::default()
            },
        );

        emit_signal(&sig, &());
        // Highest priority fires first.
        assert_eq!(*order.lock().unwrap(), vec![2, 1, 3]);
    }

    #[test]
    fn connect_signal_once_fires_then_disconnects() {
        let sig: Signal<()> = Signal::new();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _slot = connect_signal_once(
            &sig,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() += 1;
            }),
        );
        emit_signal(&sig, &());
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 1);
    }

    // --- disconnect_signal ---

    #[test]
    fn disconnect_signal_by_id_stops_firing() {
        let sig: Signal<()> = Signal::new();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let slot = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        let id = slot.id();
        disconnect_signal(&sig, id);
        // Slot guard still alive but connection was manually severed.
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 0);
    }

    // --- SlotGuard drop ---

    #[test]
    fn slot_guard_drop_disconnects() {
        let sig: Signal<()> = Signal::new();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        {
            let _slot = connect_signal(
                &sig,
                Arc::new(move |_: &()| {
                    *c.lock().unwrap() += 1;
                }),
                Default::default(),
            );
            emit_signal(&sig, &());
            // _slot dropped here
        }
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 1);
    }

    // --- multiple slots ---

    #[test]
    fn multiple_slots_all_fire() {
        let sig: Signal<i32> = Signal::new();
        let sum = Arc::new(Mutex::new(0i32));
        let s1 = Arc::clone(&sum);
        let s2 = Arc::clone(&sum);
        let _sl1 = connect_signal(
            &sig,
            Arc::new(move |v: &i32| {
                *s1.lock().unwrap() += *v;
            }),
            Default::default(),
        );
        let _sl2 = connect_signal(
            &sig,
            Arc::new(move |v: &i32| {
                *s2.lock().unwrap() += *v;
            }),
            Default::default(),
        );
        emit_signal(&sig, &3);
        assert_eq!(*sum.lock().unwrap(), 6);
    }

    // --- slot guard disconnect method ---

    #[test]
    fn slot_guard_disconnect_method_stops_firing() {
        let sig: Signal<()> = Signal::new();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let slot = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *c.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        slot.disconnect();
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 0);
    }
}
