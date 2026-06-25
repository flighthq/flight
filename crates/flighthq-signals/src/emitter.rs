use std::sync::{Arc, Mutex};

use crate::signal::Signal;

/// The stored callback type for a [`Signal<T>`]: receives a shared borrow of
/// the payload. `Arc`-shared so heterogeneous closures can live in one slot
/// list and be cloned cheaply for snapshot dispatch.
pub type SignalCallback<T> = Arc<dyn Fn(&T) + Send + Sync>;

/// Options for connecting a slot to a signal.
#[derive(Clone, Copy, Debug, Default)]
pub struct SignalConnectOptions {
    /// Fire this slot only once, then disconnect automatically. Defaults to
    /// `false`.
    pub once: bool,
    /// Higher-priority slots fire before lower-priority ones. Ties resolve
    /// in insertion order. Defaults to `0`.
    pub priority: i32,
}

/// A unique identifier for a connected slot. Used internally by
/// [`SlotGuard`](crate::slot::SlotGuard) to disconnect on drop.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SlotId(u64);

struct SlotEntry<T> {
    id: SlotId,
    priority: i32,
    /// `true` → fires every time; `false` → fires once then is removed.
    repeat: bool,
    callback: SignalCallback<T>,
}

/// Manages a list of connected slots in priority order. Shared behind
/// `Arc<Mutex<...>>` by [`Signal`].
pub struct SignalEmitter<T> {
    slots: Vec<SlotEntry<T>>,
    next_id: u64,
    /// Set to `true` by [`cancel`](SignalEmitter::cancel) during an emit to
    /// stop further propagation.
    cancelled: bool,
}

impl<T> SignalEmitter<T> {
    pub(crate) fn new() -> Self {
        Self {
            slots: Vec::new(),
            next_id: 0,
            cancelled: false,
        }
    }

    /// Returns the number of currently connected slots.
    pub fn slot_count(&self) -> usize {
        self.slots.len()
    }

    /// Returns `true` if a slot with the given id is connected.
    pub fn is_slot_connected_by_id(&self, id: SlotId) -> bool {
        self.slots.iter().any(|s| s.id == id)
    }

    /// Disconnects the slot with the given id. No-op if not found.
    pub fn disconnect_by_id(&mut self, id: SlotId) {
        self.slots.retain(|s| s.id != id);
    }

    /// Disconnects all slots.
    pub fn disconnect_all(&mut self) {
        self.slots.clear();
    }

    /// Marks the current emit pass as cancelled. Has no effect when called
    /// outside an emit.
    pub fn cancel(&mut self) {
        self.cancelled = true;
    }

    /// Connects `callback` with the given options. Returns a [`SlotId`] that
    /// can be used to disconnect later. Prefer
    /// [`connect_signal`](crate::slot::connect_signal) which returns a RAII
    /// [`SlotGuard`](crate::slot::SlotGuard).
    pub(crate) fn connect_raw(
        &mut self,
        callback: SignalCallback<T>,
        options: SignalConnectOptions,
    ) -> SlotId {
        let id = SlotId(self.next_id);
        self.next_id += 1;

        let entry = SlotEntry {
            id,
            priority: options.priority,
            repeat: !options.once,
            callback,
        };

        // Insert in descending priority order (highest fires first); ties
        // preserve insertion order.
        let pos = self
            .slots
            .iter()
            .position(|s| options.priority > s.priority)
            .unwrap_or(self.slots.len());
        self.slots.insert(pos, entry);
        id
    }
}

// ---- Dispatch -------------------------------------------------------------
//
// `emit_signal` snapshots the active slot list (cloning each `Arc` callback)
// under the lock, releases the lock, then calls each callback with one shared
// borrow of the payload. After the callbacks fire it re-acquires the lock to
// remove once-slots and reset the cancelled flag.
//
// Releasing the Mutex before running user callbacks avoids a deadlock if a
// callback tries to connect/disconnect/emit on the same signal.

struct SnapEntry<T> {
    id: SlotId,
    repeat: bool,
    callback: SignalCallback<T>,
}

fn take_snapshot<T>(emitter: &SignalEmitter<T>) -> Vec<SnapEntry<T>> {
    emitter
        .slots
        .iter()
        .map(|s| SnapEntry {
            id: s.id,
            repeat: s.repeat,
            callback: Arc::clone(&s.callback),
        })
        .collect()
}

fn commit_snapshot<T>(emitter: &mut SignalEmitter<T>, snap: &[SnapEntry<T>], fired_until: usize) {
    // Remove once-slots that actually fired (indices 0..fired_until in snap).
    for entry in snap.iter().take(fired_until) {
        if !entry.repeat {
            emitter.slots.retain(|s| s.id != entry.id);
        }
    }
    // Reset cancellation state.
    emitter.cancelled = false;
}

/// Emits `signal`, firing every connected slot in priority order with a shared
/// borrow of `payload`. A slot may call [`cancel_signal`] to stop further
/// propagation. Once-slots are removed after they fire.
///
/// For a zero-data notification, parameterize the signal as `Signal<()>` and
/// emit with `emit_signal(&sig, &())`.
pub fn emit_signal<T>(signal: &Signal<T>, payload: &T) {
    let _ = emit_signal_cancellable(signal, payload);
}

/// Emits `signal` like [`emit_signal`], and returns `true` when a slot vetoed
/// the pass by calling [`cancel_signal`]. The Rust analogue of reading
/// `signal.data.cancelled` after a TypeScript emit: because the cancelled flag
/// is reset at the end of every emit, this is the only race-free way to observe
/// a veto, captured before the reset.
pub fn emit_signal_cancellable<T>(signal: &Signal<T>, payload: &T) -> bool {
    let snap = {
        let mut guard = signal.emitter.lock().unwrap();
        guard.cancelled = false;
        take_snapshot(&guard)
    };

    let mut fired = 0;
    let mut cancelled = false;
    for entry in &snap {
        (entry.callback)(payload);
        fired += 1;
        if signal.emitter.lock().unwrap().cancelled {
            cancelled = true;
            break;
        }
    }

    let mut guard = signal.emitter.lock().unwrap();
    commit_snapshot(&mut guard, &snap, fired);
    cancelled
}

// ---- Other free functions ------------------------------------------------

/// Cancels the current emit pass on `signal`. Call from within a slot
/// callback to stop further slots from firing. No-op when called outside an
/// emit.
pub fn cancel_signal<T>(signal: &Signal<T>) {
    signal.emitter.lock().unwrap().cancel();
}

/// Returns `true` if the slot identified by `id` is currently connected to
/// `signal`.
pub fn is_slot_connected<T>(signal: &Signal<T>, id: SlotId) -> bool {
    signal.emitter.lock().unwrap().is_slot_connected_by_id(id)
}

/// Disconnects all slots from `signal`.
pub fn clear_signal<T>(signal: &Signal<T>) {
    signal.emitter.lock().unwrap().disconnect_all();
}

/// Returns `true` if `signal` has at least one connected slot.
pub fn has_signal_slots<T>(signal: &Signal<T>) -> bool {
    signal.emitter.lock().unwrap().slot_count() > 0
}

/// Connects `callback` to `signal`'s emitter and returns a [`SlotId`].
/// Internal helper used by [`connect_signal`](crate::slot::connect_signal).
pub(crate) fn emitter_connect_raw<T>(
    emitter: &Arc<Mutex<SignalEmitter<T>>>,
    callback: SignalCallback<T>,
    options: SignalConnectOptions,
) -> SlotId {
    emitter.lock().unwrap().connect_raw(callback, options)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::signal::Signal;
    use crate::slot::{connect_signal, disconnect_signal};

    // --- cancel_signal ---

    #[test]
    fn cancel_signal_stops_propagation() {
        let sig: Signal<()> = Signal::new();
        let fired1 = Arc::new(Mutex::new(false));
        let fired2 = Arc::new(Mutex::new(false));

        let sig_clone = sig.clone();
        let fired1_c = Arc::clone(&fired1);
        let _s1 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *fired1_c.lock().unwrap() = true;
                cancel_signal(&sig_clone);
            }),
            SignalConnectOptions {
                priority: 10,
                ..Default::default()
            },
        );

        let fired2_c = Arc::clone(&fired2);
        let _s2 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *fired2_c.lock().unwrap() = true;
            }),
            SignalConnectOptions {
                priority: 5,
                ..Default::default()
            },
        );

        emit_signal(&sig, &());
        assert!(*fired1.lock().unwrap());
        assert!(!*fired2.lock().unwrap());
    }

    // --- clear_signal ---

    #[test]
    fn clear_signal_removes_all_slots() {
        let sig: Signal<()> = Signal::new();
        let count = Arc::new(Mutex::new(0u32));
        let c1 = Arc::clone(&count);
        let _s1 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *c1.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        let c2 = Arc::clone(&count);
        let _s2 = connect_signal(
            &sig,
            Arc::new(move |_: &()| {
                *c2.lock().unwrap() += 1;
            }),
            Default::default(),
        );
        clear_signal(&sig);
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 0);
    }

    // --- has_signal_slots ---

    #[test]
    fn has_signal_slots_returns_false_when_no_slot_is_connected() {
        let sig: Signal<()> = Signal::new();
        assert!(!has_signal_slots(&sig));
    }

    #[test]
    fn has_signal_slots_returns_true_when_a_slot_is_connected() {
        let sig: Signal<()> = Signal::new();
        let _slot = connect_signal(&sig, Arc::new(|_: &()| {}), Default::default());
        assert!(has_signal_slots(&sig));
    }

    #[test]
    fn has_signal_slots_returns_false_after_last_slot_disconnected() {
        let sig: Signal<()> = Signal::new();
        let slot = connect_signal(&sig, Arc::new(|_: &()| {}), Default::default());
        let id = slot.id();
        disconnect_signal(&sig, id);
        assert!(!has_signal_slots(&sig));
    }

    // --- emit_signal ---

    #[test]
    fn emit_signal_fires_all_connected_slots() {
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
        emit_signal(&sig, &());
        assert_eq!(*count.lock().unwrap(), 2);
    }

    #[test]
    fn emit_signal_passes_payload() {
        let sig: Signal<i32> = Signal::new();
        let received = Arc::new(Mutex::new(0i32));
        let r = Arc::clone(&received);
        let _slot = connect_signal(
            &sig,
            Arc::new(move |v: &i32| {
                *r.lock().unwrap() = *v;
            }),
            Default::default(),
        );
        emit_signal(&sig, &42);
        assert_eq!(*received.lock().unwrap(), 42);
    }

    #[test]
    fn emit_signal_passes_struct_payload() {
        struct ResizeEvent {
            width: f32,
            height: f32,
        }

        let sig: Signal<ResizeEvent> = Signal::new();
        let got = Arc::new(Mutex::new((0.0f32, 0.0f32)));
        let g = Arc::clone(&got);
        let _slot = connect_signal(
            &sig,
            Arc::new(move |e: &ResizeEvent| {
                *g.lock().unwrap() = (e.width, e.height);
            }),
            Default::default(),
        );
        emit_signal(
            &sig,
            &ResizeEvent {
                width: 800.0,
                height: 600.0,
            },
        );
        assert_eq!(*got.lock().unwrap(), (800.0, 600.0));
    }

    // --- is_slot_connected ---

    #[test]
    fn is_slot_connected_returns_true_when_connected() {
        let sig: Signal<()> = Signal::new();
        let slot = connect_signal(&sig, Arc::new(|_: &()| {}), Default::default());
        assert!(is_slot_connected(&sig, slot.id()));
    }

    #[test]
    fn is_slot_connected_returns_false_after_drop() {
        let sig: Signal<()> = Signal::new();
        let id = {
            let slot = connect_signal(&sig, Arc::new(|_: &()| {}), Default::default());
            slot.id()
        };
        assert!(!is_slot_connected(&sig, id));
    }
}
