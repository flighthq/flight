use std::sync::{Arc, Mutex};

use crate::emitter::SignalEmitter;

/// A signal that fans a single payload value out to multiple listeners.
///
/// `T` is the payload type carried to each listener — a named event struct
/// (preferred for built-in SDK dispatches), a tuple, a primitive, or `()` for
/// a pure notification with no data. Listeners receive `&T`, so one payload is
/// shared across every slot without cloning.
///
/// Signals are cheaply cloneable: all clones share the same underlying
/// [`SignalEmitter`] behind an `Arc<Mutex<...>>`. A signal with no connected
/// slots is a no-op on emit.
pub struct Signal<T> {
    pub(crate) emitter: Arc<Mutex<SignalEmitter<T>>>,
}

impl<T> Signal<T> {
    /// Creates a new signal with no connected slots.
    pub fn new() -> Self {
        Self {
            emitter: Arc::new(Mutex::new(SignalEmitter::new())),
        }
    }

    /// Returns `true` if at least one slot is currently connected.
    pub fn has_listeners(&self) -> bool {
        self.emitter.lock().map(|e| e.slot_count() > 0).unwrap_or(false)
    }
}

impl<T> Default for Signal<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Clone for Signal<T> {
    fn clone(&self) -> Self {
        Self {
            emitter: Arc::clone(&self.emitter),
        }
    }
}

impl<T> std::fmt::Debug for Signal<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let slot_count = self.emitter.lock().map(|e| e.slot_count()).unwrap_or(0);
        f.debug_struct("Signal")
            .field("slot_count", &slot_count)
            .finish()
    }
}

/// Creates a new signal with no connected slots. Mirrors the TS
/// `createSignal<T>()`.
pub fn create_signal<T>() -> Signal<T> {
    Signal::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_signal_returns_empty_signal() {
        let sig: Signal<i32> = create_signal();
        assert_eq!(sig.emitter.lock().unwrap().slot_count(), 0);
    }

    #[test]
    fn signal_clone_shares_emitter() {
        let sig: Signal<i32> = create_signal();
        let sig2 = sig.clone();
        assert!(Arc::ptr_eq(&sig.emitter, &sig2.emitter));
    }

    #[test]
    fn signal_default_returns_empty_signal() {
        let sig: Signal<()> = Signal::default();
        assert_eq!(sig.emitter.lock().unwrap().slot_count(), 0);
    }
}
