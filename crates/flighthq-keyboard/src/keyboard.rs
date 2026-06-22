//! Soft keyboard free functions and backend management.

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{SoftKeyboard, SoftKeyboardBackend, SoftKeyboardInfo};

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering on-screen keyboard changes to `keyboard`'s signals by
/// subscribing to the active backend. On each change it reads fresh info and
/// emits `on_resize` plus `on_show` when visibility transitions to true and
/// `on_hide` when it transitions to false.
///
/// Idempotent: a prior subscription is torn down first. Pair with
/// [`detach_soft_keyboard`] / [`dispose_soft_keyboard`].
pub fn attach_soft_keyboard(keyboard: &SoftKeyboard) {
    detach_soft_keyboard(keyboard);
    let backend = get_soft_keyboard_backend();

    let mut scratch = create_soft_keyboard_info();
    backend.get_info(&mut scratch);
    let was_visible = Arc::new(Mutex::new(scratch.visible));

    let on_hide = keyboard.on_hide.clone();
    let on_resize = keyboard.on_resize.clone();
    let on_show = keyboard.on_show.clone();
    let backend_for_listener = Arc::clone(&backend);
    let was_visible_for_listener = Arc::clone(&was_visible);

    let unsubscribe = backend.subscribe(Box::new(move || {
        let mut info = SoftKeyboardInfo::default();
        backend_for_listener.get_info(&mut info);
        emit_signal(&on_resize, &info.height);
        let mut guard = was_visible_for_listener
            .lock()
            .expect("soft keyboard visibility mutex poisoned");
        if info.visible != *guard {
            *guard = info.visible;
            if info.visible {
                emit_signal(&on_show, &info.height);
            } else {
                emit_signal(&on_hide, &());
            }
        }
    }));

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("soft keyboard subscriptions mutex poisoned");
    guard.push((keyboard as *const SoftKeyboard as usize, unsubscribe));
}

/// Allocates a [`SoftKeyboard`] event entity with inert signals; call
/// [`attach_soft_keyboard`] to start delivery.
pub fn create_soft_keyboard() -> SoftKeyboard {
    SoftKeyboard::default()
}

/// Allocates a zeroed [`SoftKeyboardInfo`], suitable as the `out` for
/// [`get_soft_keyboard_info`].
pub fn create_soft_keyboard_info() -> SoftKeyboardInfo {
    SoftKeyboardInfo::default()
}

/// Stops delivery to `keyboard` and forgets its subscription. Safe to call
/// when not attached.
pub fn detach_soft_keyboard(keyboard: &SoftKeyboard) {
    let key = keyboard as *const SoftKeyboard as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("soft keyboard subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsubscribe) = guard.remove(pos);
        unsubscribe();
    }
}

/// Releases `keyboard` by detaching its backend subscription. The signals
/// remain plain memory afterwards and will be freed when the last reference
/// is dropped.
pub fn dispose_soft_keyboard(keyboard: &SoftKeyboard) {
    detach_soft_keyboard(keyboard);
}

/// Returns the active soft keyboard backend, or a lazily-created sentinel
/// default. There is always a backend.
///
/// The default backend reports the keyboard as hidden with height `0` and
/// treats `show`/`hide` as no-ops, because std alone cannot present or measure
/// an on-screen keyboard. A native or web host installs a real backend via
/// [`set_soft_keyboard_backend`].
pub fn get_soft_keyboard_backend() -> Arc<dyn SoftKeyboardBackend> {
    let guard = BACKEND
        .lock()
        .expect("soft keyboard backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(SentinelSoftKeyboardBackend),
    }
}

/// Fills `out` with the current on-screen keyboard snapshot and returns a
/// reference to it.
pub fn get_soft_keyboard_info(out: &mut SoftKeyboardInfo) -> &mut SoftKeyboardInfo {
    get_soft_keyboard_backend().get_info(out)
}

/// Requests that the host dismiss the on-screen keyboard. A no-op when the
/// host cannot programmatically dismiss it.
pub fn hide_soft_keyboard() {
    get_soft_keyboard_backend().hide();
}

/// Returns `true` when the on-screen keyboard is currently visible.
pub fn is_soft_keyboard_visible() -> bool {
    let mut info = create_soft_keyboard_info();
    get_soft_keyboard_info(&mut info);
    info.visible
}

/// Installs a native host soft keyboard backend; pass `None` to fall back to
/// the sentinel default.
pub fn set_soft_keyboard_backend(backend: Option<Arc<dyn SoftKeyboardBackend>>) {
    let mut guard = BACKEND
        .lock()
        .expect("soft keyboard backend mutex poisoned");
    *guard = backend;
}

/// Requests that the host present the on-screen keyboard. A no-op when the
/// host cannot programmatically open it.
pub fn show_soft_keyboard() {
    get_soft_keyboard_backend().show();
}

// ---------------------------------------------------------------------------
// Default sentinel backend
// ---------------------------------------------------------------------------

// std cannot present, measure, or observe an on-screen keyboard, so the
// default backend returns clean sentinels and no-ops rather than panicking.
// A native/web host replaces it via `set_soft_keyboard_backend`.
struct SentinelSoftKeyboardBackend;

impl SoftKeyboardBackend for SentinelSoftKeyboardBackend {
    fn get_info<'a>(&self, out: &'a mut SoftKeyboardInfo) -> &'a mut SoftKeyboardInfo {
        out.visible = false;
        out.height = 0.0;
        out
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn show(&self) {}

    fn hide(&self) {}
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn SoftKeyboardBackend>>> = Mutex::new(None);

// Subscription list: (SoftKeyboard address, unsubscribe fn).
static SUBSCRIPTIONS: Mutex<Vec<(usize, Box<dyn Fn() + Send + Sync>)>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use serial_test::serial;

    use super::*;

    #[derive(Default)]
    struct FakeState {
        visible: Mutex<bool>,
        height: Mutex<f32>,
        listener: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
        shown: Mutex<bool>,
        hidden: Mutex<bool>,
    }

    struct FakeBackend {
        state: Arc<FakeState>,
    }

    impl SoftKeyboardBackend for FakeBackend {
        fn get_info<'a>(&self, out: &'a mut SoftKeyboardInfo) -> &'a mut SoftKeyboardInfo {
            out.visible = *self.state.visible.lock().unwrap();
            out.height = *self.state.height.lock().unwrap();
            out
        }
        fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            *self.state.listener.lock().unwrap() = Some(listener);
            let state = Arc::clone(&self.state);
            Box::new(move || {
                *state.listener.lock().unwrap() = None;
            })
        }
        fn show(&self) {
            *self.state.shown.lock().unwrap() = true;
        }
        fn hide(&self) {
            *self.state.hidden.lock().unwrap() = true;
        }
    }

    fn fire(state: &FakeState) {
        let guard = state.listener.lock().unwrap();
        if let Some(listener) = guard.as_ref() {
            listener();
        }
    }

    // --- attach_soft_keyboard ---

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_resize_and_show_when_visible() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let resizes = Arc::new(AtomicUsize::new(0));
        let shows = Arc::new(AtomicUsize::new(0));
        let r = Arc::clone(&resizes);
        let s = Arc::clone(&shows);
        let _g1 = connect_signal(
            &keyboard.on_resize,
            Arc::new(move |_: &f32| {
                r.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let _g2 = connect_signal(
            &keyboard.on_show,
            Arc::new(move |_: &f32| {
                s.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        fire(&state);
        assert_eq!(resizes.load(Ordering::SeqCst), 1);
        assert_eq!(shows.load(Ordering::SeqCst), 1);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    // --- create_soft_keyboard ---

    #[test]
    #[serial]
    fn create_soft_keyboard_returns_default_entity() {
        let keyboard = create_soft_keyboard();
        // Signals start with no listeners; emitting must be a safe no-op.
        emit_signal(&keyboard.on_hide, &());
        emit_signal(&keyboard.on_resize, &0.0);
        emit_signal(&keyboard.on_show, &0.0);
    }

    // --- create_soft_keyboard_info ---

    #[test]
    #[serial]
    fn create_soft_keyboard_info_returns_zeroed() {
        let info = create_soft_keyboard_info();
        assert!(!info.visible);
        assert_eq!(info.height, 0.0);
    }

    // --- detach_soft_keyboard ---

    #[test]
    #[serial]
    fn detach_soft_keyboard_stops_delivery() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let resizes = Arc::new(AtomicUsize::new(0));
        let r = Arc::clone(&resizes);
        let _g = connect_signal(
            &keyboard.on_resize,
            Arc::new(move |_: &f32| {
                r.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        detach_soft_keyboard(&keyboard);
        fire(&state);
        assert_eq!(resizes.load(Ordering::SeqCst), 0);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn detach_soft_keyboard_is_safe_when_not_attached() {
        let keyboard = create_soft_keyboard();
        detach_soft_keyboard(&keyboard);
    }

    // --- dispose_soft_keyboard ---

    #[test]
    #[serial]
    fn dispose_soft_keyboard_detaches() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        attach_soft_keyboard(&keyboard);
        dispose_soft_keyboard(&keyboard);
        // After dispose, the subscription is gone.
        assert!(state.listener.lock().unwrap().is_none());
        set_soft_keyboard_backend(None);
    }

    // --- get_soft_keyboard_backend ---

    #[test]
    #[serial]
    fn get_soft_keyboard_backend_falls_back_to_sentinel() {
        set_soft_keyboard_backend(None);
        let backend = get_soft_keyboard_backend();
        let mut info = create_soft_keyboard_info();
        backend.get_info(&mut info);
        assert!(!info.visible);
        assert_eq!(info.height, 0.0);
    }

    // --- get_soft_keyboard_info ---

    #[test]
    #[serial]
    fn get_soft_keyboard_info_fills_out_from_backend() {
        let state = Arc::new(FakeState::default());
        *state.height.lock().unwrap() = 250.0;
        *state.visible.lock().unwrap() = true;
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let mut out = create_soft_keyboard_info();
        let returned = get_soft_keyboard_info(&mut out);
        assert_eq!(returned.height, 250.0);
        assert!(returned.visible);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn get_soft_keyboard_info_sentinel_reports_hidden() {
        set_soft_keyboard_backend(None);
        let mut out = create_soft_keyboard_info();
        get_soft_keyboard_info(&mut out);
        assert!(!out.visible);
        assert_eq!(out.height, 0.0);
    }

    // --- hide_soft_keyboard ---

    #[test]
    #[serial]
    fn hide_soft_keyboard_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        hide_soft_keyboard();
        assert!(*state.hidden.lock().unwrap());
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn hide_soft_keyboard_sentinel_is_noop() {
        set_soft_keyboard_backend(None);
        hide_soft_keyboard();
    }

    // --- is_soft_keyboard_visible ---

    #[test]
    #[serial]
    fn is_soft_keyboard_visible_sentinel_returns_false() {
        set_soft_keyboard_backend(None);
        assert!(!is_soft_keyboard_visible());
    }

    // --- set_soft_keyboard_backend ---

    #[test]
    #[serial]
    fn set_soft_keyboard_backend_clears_to_sentinel_when_none() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        set_soft_keyboard_backend(None);
        // Sentinel fallback is always available.
        assert!(!is_soft_keyboard_visible());
    }

    // --- show_soft_keyboard ---

    #[test]
    #[serial]
    fn show_soft_keyboard_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        show_soft_keyboard();
        assert!(*state.shown.lock().unwrap());
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn show_soft_keyboard_sentinel_is_noop() {
        set_soft_keyboard_backend(None);
        show_soft_keyboard();
    }
}
