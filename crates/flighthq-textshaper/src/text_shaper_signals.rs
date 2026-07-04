//! Signal group for text-shaper events: lazily created via
//! [`enable_text_shaper_signals`], queried via [`get_text_shaper_signals`], and
//! torn down via [`dispose_text_shaper_signals`].
//!
//! The `on_backend_changed` signal fires whenever [`set_text_shaper_backend`] is
//! called, carrying the new backend (or `None` when cleared). This lets modules
//! like `flighthq-textlayout` observe shaper registration without a dependency
//! cycle: the shaper crate owns the signal, the observer connects to it.

use std::sync::{Arc, Mutex};

use flighthq_signals::{Signal, clear_signal, create_signal, emit_signal};
use flighthq_types::TextShaperBackend;

use crate::text_shaper_hooks::set_text_shaper_backend_hook;

/// Signal group for text-shaper events.
#[derive(Clone)]
pub struct TextShaperSignals {
    /// Fires when the active `TextShaperBackend` changes (including when cleared
    /// to `None`).
    pub on_backend_changed: Signal<Option<Arc<dyn TextShaperBackend>>>,
}

/// Tears down the text-shaper signal group: clears all connected slots on
/// `on_backend_changed`, removes the backend hook, and releases the signal
/// group. No-op if signals were never enabled.
pub fn dispose_text_shaper_signals() {
    let mut guard = SIGNALS.lock().expect("text shaper signals poisoned");
    if let Some(ref signals) = *guard {
        clear_signal(&signals.on_backend_changed);
    }
    *guard = None;
    drop(guard);
    set_text_shaper_backend_hook(None);
}

/// Lazily creates the text-shaper signal group and wires a backend hook that
/// emits `on_backend_changed` whenever [`set_text_shaper_backend`] is called.
/// Returns the existing signals if already enabled. The cost of the signal
/// infrastructure is assumed only when this function is called.
pub fn enable_text_shaper_signals() -> TextShaperSignals {
    let mut guard = SIGNALS.lock().expect("text shaper signals poisoned");
    if let Some(ref signals) = *guard {
        return signals.clone();
    }
    let signals = TextShaperSignals {
        on_backend_changed: create_signal(),
    };
    let signal_clone = signals.on_backend_changed.clone();
    set_text_shaper_backend_hook(Some(Box::new(move |backend| {
        let payload = backend.cloned();
        emit_signal(&signal_clone, &payload);
    })));
    *guard = Some(signals.clone());
    signals
}

/// Returns the current text-shaper signal group, or `None` if
/// [`enable_text_shaper_signals`] has not been called (or signals were disposed).
pub fn get_text_shaper_signals() -> Option<TextShaperSignals> {
    SIGNALS
        .lock()
        .expect("text shaper signals poisoned")
        .clone()
}

static SIGNALS: Mutex<Option<TextShaperSignals>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use flighthq_types::TextFormat;
    use serial_test::serial;

    use super::*;
    use crate::set_text_shaper_backend;

    struct DummyBackend;
    impl TextShaperBackend for DummyBackend {
        fn measure_text(&self, _text: &str, _format: &TextFormat) -> f32 {
            0.0
        }
    }

    fn cleanup() {
        dispose_text_shaper_signals();
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn dispose_text_shaper_signals_noop_when_not_enabled() {
        cleanup();
        // Should not panic.
        dispose_text_shaper_signals();
    }

    #[test]
    #[serial]
    fn enable_text_shaper_signals_returns_signals() {
        cleanup();
        let signals = enable_text_shaper_signals();
        assert!(!signals.on_backend_changed.has_listeners());
        cleanup();
    }

    #[test]
    #[serial]
    fn enable_text_shaper_signals_returns_same_instance() {
        cleanup();
        let a = enable_text_shaper_signals();
        let b = enable_text_shaper_signals();
        // Both share the same underlying signal emitter (Arc clone).
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_c = calls.clone();
        let _guard = connect_signal(
            &a.on_backend_changed,
            Arc::new(move |_| {
                calls_c.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        set_text_shaper_backend(Some(Arc::new(DummyBackend)));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        // b sees the same listener count.
        assert!(b.on_backend_changed.has_listeners());
        cleanup();
    }

    #[test]
    #[serial]
    fn enable_text_shaper_signals_fires_on_backend_change() {
        cleanup();
        let signals = enable_text_shaper_signals();
        let saw_some = Arc::new(AtomicUsize::new(0));
        let saw_none = Arc::new(AtomicUsize::new(0));
        let saw_some_c = saw_some.clone();
        let saw_none_c = saw_none.clone();
        let _guard = connect_signal(
            &signals.on_backend_changed,
            Arc::new(move |backend| {
                if backend.is_some() {
                    saw_some_c.fetch_add(1, Ordering::SeqCst);
                } else {
                    saw_none_c.fetch_add(1, Ordering::SeqCst);
                }
            }),
            SignalConnectOptions::default(),
        );
        set_text_shaper_backend(Some(Arc::new(DummyBackend)));
        assert_eq!(saw_some.load(Ordering::SeqCst), 1);
        set_text_shaper_backend(None);
        assert_eq!(saw_none.load(Ordering::SeqCst), 1);
        cleanup();
    }

    #[test]
    #[serial]
    fn get_text_shaper_signals_returns_none_before_enable() {
        cleanup();
        assert!(get_text_shaper_signals().is_none());
    }

    #[test]
    #[serial]
    fn get_text_shaper_signals_returns_some_after_enable() {
        cleanup();
        enable_text_shaper_signals();
        assert!(get_text_shaper_signals().is_some());
        cleanup();
    }

    #[test]
    #[serial]
    fn get_text_shaper_signals_returns_none_after_dispose() {
        cleanup();
        enable_text_shaper_signals();
        dispose_text_shaper_signals();
        assert!(get_text_shaper_signals().is_none());
    }
}
