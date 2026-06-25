//! Soft keyboard free functions and backend management.

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{
    SOFT_KEYBOARD_RESIZE_NONE_KIND, SoftKeyboard, SoftKeyboardBackend, SoftKeyboardInfo,
    SoftKeyboardPhase, SoftKeyboardResizeMode, SoftKeyboardStyleKind, SoftKeyboardTransition,
};

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering on-screen keyboard changes to `keyboard`'s signals by
/// subscribing to the active backend. On each change it reads fresh info, emits
/// will/did signal pairs (with `on_show`/`on_hide`/`on_resize` aliases firing
/// alongside the did-phase edge), and tracks visibility-edge transitions for
/// `on_will_show`/`on_will_hide` and `on_did_show`/`on_did_hide` pairs.
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
    let on_will_show = keyboard.on_will_show.clone();
    let on_will_hide = keyboard.on_will_hide.clone();
    let on_will_resize = keyboard.on_will_resize.clone();
    let on_did_show = keyboard.on_did_show.clone();
    let on_did_hide = keyboard.on_did_hide.clone();
    let on_did_resize = keyboard.on_did_resize.clone();
    let backend_for_listener = Arc::clone(&backend);
    let was_visible_for_listener = Arc::clone(&was_visible);

    let unsubscribe = backend.subscribe(Box::new(
        move |phase: SoftKeyboardPhase, transition: &SoftKeyboardTransition| {
            let mut guard = was_visible_for_listener
                .lock()
                .expect("soft keyboard visibility mutex poisoned");
            let prev_visible = *guard;
            let mut info = SoftKeyboardInfo::default();
            backend_for_listener.get_info(&mut info);
            let now_visible = info.visible;
            if phase == SoftKeyboardPhase::Will {
                // Will-phase: emit will-signals before the animation begins.
                if now_visible && !prev_visible {
                    emit_signal(&on_will_show, transition);
                } else if !now_visible && prev_visible {
                    emit_signal(&on_will_hide, transition);
                } else {
                    emit_signal(&on_will_resize, transition);
                }
            } else {
                // Did-phase: emit did-signals (and simple-path aliases) after the animation ends.
                emit_signal(&on_did_resize, &info.height);
                emit_signal(&on_resize, &info.height);
                if now_visible != prev_visible {
                    *guard = now_visible;
                    if now_visible {
                        emit_signal(&on_did_show, &info.height);
                        emit_signal(&on_show, &info.height);
                    } else {
                        emit_signal(&on_did_hide, &());
                        emit_signal(&on_hide, &());
                    }
                }
            }
        },
    ));

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

/// Allocates a zeroed [`SoftKeyboardTransition`] with `duration_seconds` 0 and
/// `height` 0.
pub fn create_soft_keyboard_transition() -> SoftKeyboardTransition {
    SoftKeyboardTransition::default()
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

/// Returns the current on-screen keyboard height in CSS pixels without
/// allocating beyond a transient snapshot. `0` when hidden.
pub fn get_soft_keyboard_height() -> f32 {
    let mut info = SoftKeyboardInfo::default();
    get_soft_keyboard_backend().get_info(&mut info);
    info.height
}

/// Fills `out` with the current on-screen keyboard snapshot and returns a
/// reference to it.
pub fn get_soft_keyboard_info(out: &mut SoftKeyboardInfo) -> &mut SoftKeyboardInfo {
    get_soft_keyboard_backend().get_info(out)
}

/// Returns the current keyboard resize mode. Delegates to the backend; returns
/// [`SOFT_KEYBOARD_RESIZE_NONE_KIND`] when the backend does not support
/// resize-mode queries.
pub fn get_soft_keyboard_resize_mode() -> SoftKeyboardResizeMode {
    get_soft_keyboard_backend()
        .get_resize_mode()
        .unwrap_or(SOFT_KEYBOARD_RESIZE_NONE_KIND)
}

/// Requests that the host dismiss the on-screen keyboard. A no-op when the
/// host cannot programmatically dismiss it.
pub fn hide_soft_keyboard() {
    get_soft_keyboard_backend().hide();
}

/// Returns whether the input accessory bar (iOS toolbar above the keyboard) is
/// visible. Returns `false` when the backend does not support this query.
pub fn is_soft_keyboard_accessory_bar_visible() -> bool {
    get_soft_keyboard_backend()
        .get_accessory_bar_visible()
        .unwrap_or(false)
}

/// Returns whether scroll-assist is enabled. Returns `false` when the backend
/// does not support this query.
pub fn is_soft_keyboard_scroll_assist_enabled() -> bool {
    get_soft_keyboard_backend()
        .get_scroll_assist_enabled()
        .unwrap_or(false)
}

/// Returns `true` when the on-screen keyboard is currently visible.
pub fn is_soft_keyboard_visible() -> bool {
    let mut info = create_soft_keyboard_info();
    get_soft_keyboard_info(&mut info);
    info.visible
}

/// Controls whether the iOS input accessory bar (the toolbar above the
/// keyboard) is visible. No-op when the backend does not support this.
pub fn set_soft_keyboard_accessory_bar_visible(visible: bool) {
    get_soft_keyboard_backend().set_accessory_bar_visible(visible);
}

/// Installs a native host soft keyboard backend; pass `None` to fall back to
/// the sentinel default.
pub fn set_soft_keyboard_backend(backend: Option<Arc<dyn SoftKeyboardBackend>>) {
    let mut guard = BACKEND
        .lock()
        .expect("soft keyboard backend mutex poisoned");
    *guard = backend;
}

/// Controls keyboard resize behavior — how the app viewport reacts when the
/// keyboard appears. No-op when the backend does not support resize-mode control.
pub fn set_soft_keyboard_resize_mode(mode: SoftKeyboardResizeMode) {
    get_soft_keyboard_backend().set_resize_mode(mode);
}

/// Controls whether the keyboard scroll-assist feature is enabled (scrolls the
/// focused field into view when the keyboard appears). No-op when the backend
/// does not support this.
pub fn set_soft_keyboard_scroll_assist_enabled(enabled: bool) {
    get_soft_keyboard_backend().set_scroll_assist_enabled(enabled);
}

/// Sets the visual style / appearance of the on-screen keyboard (iOS light/dark
/// keyboard appearance). No-op on backends that do not support style control.
pub fn set_soft_keyboard_style(style: SoftKeyboardStyleKind) {
    get_soft_keyboard_backend().set_style(style);
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
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out
    }

    fn subscribe(
        &self,
        _listener: Box<dyn Fn(SoftKeyboardPhase, &SoftKeyboardTransition) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
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
    use flighthq_types::{
        SOFT_KEYBOARD_RESIZE_BODY_KIND, SOFT_KEYBOARD_RESIZE_NONE_KIND,
        SOFT_KEYBOARD_STYLE_DARK_KIND,
    };
    use serial_test::serial;

    use super::*;

    type FakeListener = Box<dyn Fn(SoftKeyboardPhase, &SoftKeyboardTransition) + Send + Sync>;

    #[derive(Default)]
    struct FakeState {
        visible: Mutex<bool>,
        height: Mutex<f32>,
        listener: Mutex<Option<FakeListener>>,
        shown: Mutex<bool>,
        hidden: Mutex<bool>,
        resize_mode: Mutex<Option<SoftKeyboardResizeMode>>,
        accessory_bar_visible: Mutex<Option<bool>>,
        scroll_assist_enabled: Mutex<Option<bool>>,
        style: Mutex<Option<SoftKeyboardStyleKind>>,
    }

    struct FakeBackend {
        state: Arc<FakeState>,
    }

    impl SoftKeyboardBackend for FakeBackend {
        fn get_info<'a>(&self, out: &'a mut SoftKeyboardInfo) -> &'a mut SoftKeyboardInfo {
            out.visible = *self.state.visible.lock().unwrap();
            out.height = *self.state.height.lock().unwrap();
            out.x = 0.0;
            out.y = 0.0;
            out.width = if out.visible { 375.0 } else { 0.0 };
            out
        }
        fn subscribe(&self, listener: FakeListener) -> Box<dyn Fn() + Send + Sync> {
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
        fn get_resize_mode(&self) -> Option<SoftKeyboardResizeMode> {
            *self.state.resize_mode.lock().unwrap()
        }
        fn set_resize_mode(&self, mode: SoftKeyboardResizeMode) -> bool {
            *self.state.resize_mode.lock().unwrap() = Some(mode);
            true
        }
        fn set_style(&self, style: SoftKeyboardStyleKind) -> bool {
            *self.state.style.lock().unwrap() = Some(style);
            true
        }
        fn get_accessory_bar_visible(&self) -> Option<bool> {
            Some(
                self.state
                    .accessory_bar_visible
                    .lock()
                    .unwrap()
                    .unwrap_or(false),
            )
        }
        fn set_accessory_bar_visible(&self, visible: bool) -> bool {
            *self.state.accessory_bar_visible.lock().unwrap() = Some(visible);
            true
        }
        fn get_scroll_assist_enabled(&self) -> Option<bool> {
            Some(
                self.state
                    .scroll_assist_enabled
                    .lock()
                    .unwrap()
                    .unwrap_or(false),
            )
        }
        fn set_scroll_assist_enabled(&self, enabled: bool) -> bool {
            *self.state.scroll_assist_enabled.lock().unwrap() = Some(enabled);
            true
        }
    }

    // A backend that supports only the required methods, leaving the optional
    // resize/style/accessory/scroll methods at their default-unsupported state.
    struct BareBackend;

    impl SoftKeyboardBackend for BareBackend {
        fn get_info<'a>(&self, out: &'a mut SoftKeyboardInfo) -> &'a mut SoftKeyboardInfo {
            out
        }
        fn subscribe(&self, _listener: FakeListener) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
        fn show(&self) {}
        fn hide(&self) {}
    }

    fn fire(state: &FakeState, phase: SoftKeyboardPhase, duration_seconds: f32) {
        let guard = state.listener.lock().unwrap();
        if let Some(listener) = guard.as_ref() {
            let transition = SoftKeyboardTransition {
                duration_seconds,
                height: *state.height.lock().unwrap(),
            };
            listener(phase, &transition);
        }
    }

    // --- attach_soft_keyboard ---

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_resize_and_show_when_visible_did_phase() {
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
        fire(&state, SoftKeyboardPhase::Did, 0.0);
        assert_eq!(resizes.load(Ordering::SeqCst), 1);
        assert_eq!(shows.load(Ordering::SeqCst), 1);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_will_show_on_will_phase() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let durations = Arc::new(Mutex::new(Vec::<f32>::new()));
        let heights = Arc::new(Mutex::new(Vec::<f32>::new()));
        let d = Arc::clone(&durations);
        let h = Arc::clone(&heights);
        let _g = connect_signal(
            &keyboard.on_will_show,
            Arc::new(move |t: &SoftKeyboardTransition| {
                d.lock().unwrap().push(t.duration_seconds);
                h.lock().unwrap().push(t.height);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        fire(&state, SoftKeyboardPhase::Will, 0.25);
        assert_eq!(durations.lock().unwrap().as_slice(), &[0.25]);
        assert_eq!(heights.lock().unwrap().as_slice(), &[300.0]);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_will_hide_on_will_phase() {
        let state = Arc::new(FakeState::default());
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let will_hides = Arc::new(AtomicUsize::new(0));
        let wh = Arc::clone(&will_hides);
        let _g = connect_signal(
            &keyboard.on_will_hide,
            Arc::new(move |_: &SoftKeyboardTransition| {
                wh.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        *state.visible.lock().unwrap() = false;
        *state.height.lock().unwrap() = 0.0;
        fire(&state, SoftKeyboardPhase::Will, 0.3);
        assert_eq!(will_hides.load(Ordering::SeqCst), 1);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_will_resize_when_visibility_unchanged() {
        let state = Arc::new(FakeState::default());
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let will_resizes = Arc::new(AtomicUsize::new(0));
        let will_shows = Arc::new(AtomicUsize::new(0));
        let wr = Arc::clone(&will_resizes);
        let ws = Arc::clone(&will_shows);
        let _g1 = connect_signal(
            &keyboard.on_will_resize,
            Arc::new(move |_: &SoftKeyboardTransition| {
                wr.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let _g2 = connect_signal(
            &keyboard.on_will_show,
            Arc::new(move |_: &SoftKeyboardTransition| {
                ws.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        *state.height.lock().unwrap() = 350.0;
        fire(&state, SoftKeyboardPhase::Will, 0.1);
        assert_eq!(will_resizes.load(Ordering::SeqCst), 1);
        assert_eq!(will_shows.load(Ordering::SeqCst), 0);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_did_aliases_alongside_simple_path() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let did_shows = Arc::new(AtomicUsize::new(0));
        let on_shows = Arc::new(AtomicUsize::new(0));
        let ds = Arc::clone(&did_shows);
        let os = Arc::clone(&on_shows);
        let _g1 = connect_signal(
            &keyboard.on_did_show,
            Arc::new(move |_: &f32| {
                ds.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let _g2 = connect_signal(
            &keyboard.on_show,
            Arc::new(move |_: &f32| {
                os.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        fire(&state, SoftKeyboardPhase::Did, 0.0);
        assert_eq!(did_shows.load(Ordering::SeqCst), 1);
        assert_eq!(on_shows.load(Ordering::SeqCst), 1);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_soft_keyboard_emits_hide_and_did_hide_on_hide() {
        let state = Arc::new(FakeState::default());
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        let hides = Arc::new(AtomicUsize::new(0));
        let did_hides = Arc::new(AtomicUsize::new(0));
        let hi = Arc::clone(&hides);
        let dh = Arc::clone(&did_hides);
        let _g1 = connect_signal(
            &keyboard.on_hide,
            Arc::new(move |_: &()| {
                hi.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let _g2 = connect_signal(
            &keyboard.on_did_hide,
            Arc::new(move |_: &()| {
                dh.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        attach_soft_keyboard(&keyboard);
        *state.visible.lock().unwrap() = false;
        *state.height.lock().unwrap() = 0.0;
        fire(&state, SoftKeyboardPhase::Did, 0.0);
        assert_eq!(hides.load(Ordering::SeqCst), 1);
        assert_eq!(did_hides.load(Ordering::SeqCst), 1);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn attach_soft_keyboard_is_idempotent_on_reattach() {
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
        attach_soft_keyboard(&keyboard);
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 300.0;
        fire(&state, SoftKeyboardPhase::Did, 0.0);
        assert_eq!(resizes.load(Ordering::SeqCst), 1);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
    }

    // --- create_soft_keyboard ---

    #[test]
    #[serial]
    fn create_soft_keyboard_returns_default_entity_with_nine_signals() {
        let keyboard = create_soft_keyboard();
        // Signals start with no listeners; emitting must be a safe no-op.
        emit_signal(&keyboard.on_hide, &());
        emit_signal(&keyboard.on_resize, &0.0);
        emit_signal(&keyboard.on_show, &0.0);
        emit_signal(&keyboard.on_will_show, &SoftKeyboardTransition::default());
        emit_signal(&keyboard.on_will_hide, &SoftKeyboardTransition::default());
        emit_signal(&keyboard.on_will_resize, &SoftKeyboardTransition::default());
        emit_signal(&keyboard.on_did_show, &0.0);
        emit_signal(&keyboard.on_did_hide, &());
        emit_signal(&keyboard.on_did_resize, &0.0);
    }

    // --- create_soft_keyboard_info ---

    #[test]
    #[serial]
    fn create_soft_keyboard_info_returns_zeroed_including_rect() {
        let info = create_soft_keyboard_info();
        assert!(!info.visible);
        assert_eq!(info.height, 0.0);
        assert_eq!(info.x, 0.0);
        assert_eq!(info.y, 0.0);
        assert_eq!(info.width, 0.0);
    }

    // --- create_soft_keyboard_transition ---

    #[test]
    #[serial]
    fn create_soft_keyboard_transition_returns_zeroed() {
        let transition = create_soft_keyboard_transition();
        assert_eq!(transition.duration_seconds, 0.0);
        assert_eq!(transition.height, 0.0);
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
        fire(&state, SoftKeyboardPhase::Did, 0.0);
        assert_eq!(resizes.load(Ordering::SeqCst), 0);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn detach_soft_keyboard_is_safe_when_not_attached() {
        let keyboard = create_soft_keyboard();
        detach_soft_keyboard(&keyboard);
    }

    #[test]
    #[serial]
    fn detach_soft_keyboard_is_safe_when_called_twice() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        attach_soft_keyboard(&keyboard);
        detach_soft_keyboard(&keyboard);
        detach_soft_keyboard(&keyboard);
        set_soft_keyboard_backend(None);
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

    #[test]
    #[serial]
    fn dispose_soft_keyboard_stops_further_delivery() {
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
        dispose_soft_keyboard(&keyboard);
        fire(&state, SoftKeyboardPhase::Did, 0.0);
        assert_eq!(resizes.load(Ordering::SeqCst), 0);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn dispose_soft_keyboard_is_safe_when_already_detached() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        let keyboard = create_soft_keyboard();
        attach_soft_keyboard(&keyboard);
        detach_soft_keyboard(&keyboard);
        dispose_soft_keyboard(&keyboard);
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
        assert_eq!(info.x, 0.0);
        assert_eq!(info.y, 0.0);
        assert_eq!(info.width, 0.0);
    }

    // --- get_soft_keyboard_height ---

    #[test]
    #[serial]
    fn get_soft_keyboard_height_returns_current_height() {
        let state = Arc::new(FakeState::default());
        *state.visible.lock().unwrap() = true;
        *state.height.lock().unwrap() = 320.0;
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        assert_eq!(get_soft_keyboard_height(), 320.0);
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn get_soft_keyboard_height_returns_zero_when_hidden() {
        let state = Arc::new(FakeState::default());
        *state.visible.lock().unwrap() = false;
        *state.height.lock().unwrap() = 0.0;
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        assert_eq!(get_soft_keyboard_height(), 0.0);
        set_soft_keyboard_backend(None);
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
        assert_eq!(returned.x, 0.0);
        assert_eq!(returned.y, 0.0);
        assert_eq!(returned.width, 375.0);
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
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 0.0);
    }

    // --- get_soft_keyboard_resize_mode ---

    #[test]
    #[serial]
    fn get_soft_keyboard_resize_mode_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        *state.resize_mode.lock().unwrap() = Some(SOFT_KEYBOARD_RESIZE_BODY_KIND);
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        assert_eq!(
            get_soft_keyboard_resize_mode(),
            SOFT_KEYBOARD_RESIZE_BODY_KIND
        );
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn get_soft_keyboard_resize_mode_returns_none_kind_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        assert_eq!(
            get_soft_keyboard_resize_mode(),
            SOFT_KEYBOARD_RESIZE_NONE_KIND
        );
        set_soft_keyboard_backend(None);
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

    // --- is_soft_keyboard_accessory_bar_visible ---

    #[test]
    #[serial]
    fn is_soft_keyboard_accessory_bar_visible_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        *state.accessory_bar_visible.lock().unwrap() = Some(true);
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        assert!(is_soft_keyboard_accessory_bar_visible());
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn is_soft_keyboard_accessory_bar_visible_returns_false_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        assert!(!is_soft_keyboard_accessory_bar_visible());
        set_soft_keyboard_backend(None);
    }

    // --- is_soft_keyboard_scroll_assist_enabled ---

    #[test]
    #[serial]
    fn is_soft_keyboard_scroll_assist_enabled_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        *state.scroll_assist_enabled.lock().unwrap() = Some(true);
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        assert!(is_soft_keyboard_scroll_assist_enabled());
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn is_soft_keyboard_scroll_assist_enabled_returns_false_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        assert!(!is_soft_keyboard_scroll_assist_enabled());
        set_soft_keyboard_backend(None);
    }

    // --- is_soft_keyboard_visible ---

    #[test]
    #[serial]
    fn is_soft_keyboard_visible_sentinel_returns_false() {
        set_soft_keyboard_backend(None);
        assert!(!is_soft_keyboard_visible());
    }

    // --- set_soft_keyboard_accessory_bar_visible ---

    #[test]
    #[serial]
    fn set_soft_keyboard_accessory_bar_visible_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        set_soft_keyboard_accessory_bar_visible(true);
        assert_eq!(*state.accessory_bar_visible.lock().unwrap(), Some(true));
        set_soft_keyboard_accessory_bar_visible(false);
        assert_eq!(*state.accessory_bar_visible.lock().unwrap(), Some(false));
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn set_soft_keyboard_accessory_bar_visible_is_noop_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        set_soft_keyboard_accessory_bar_visible(true);
        set_soft_keyboard_backend(None);
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

    // --- set_soft_keyboard_resize_mode ---

    #[test]
    #[serial]
    fn set_soft_keyboard_resize_mode_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        set_soft_keyboard_resize_mode(SOFT_KEYBOARD_RESIZE_BODY_KIND);
        assert_eq!(
            *state.resize_mode.lock().unwrap(),
            Some(SOFT_KEYBOARD_RESIZE_BODY_KIND)
        );
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn set_soft_keyboard_resize_mode_is_noop_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        set_soft_keyboard_resize_mode(SOFT_KEYBOARD_RESIZE_BODY_KIND);
        set_soft_keyboard_backend(None);
    }

    // --- set_soft_keyboard_scroll_assist_enabled ---

    #[test]
    #[serial]
    fn set_soft_keyboard_scroll_assist_enabled_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        set_soft_keyboard_scroll_assist_enabled(true);
        assert_eq!(*state.scroll_assist_enabled.lock().unwrap(), Some(true));
        set_soft_keyboard_scroll_assist_enabled(false);
        assert_eq!(*state.scroll_assist_enabled.lock().unwrap(), Some(false));
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn set_soft_keyboard_scroll_assist_enabled_is_noop_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        set_soft_keyboard_scroll_assist_enabled(true);
        set_soft_keyboard_backend(None);
    }

    // --- set_soft_keyboard_style ---

    #[test]
    #[serial]
    fn set_soft_keyboard_style_delegates_to_backend() {
        let state = Arc::new(FakeState::default());
        set_soft_keyboard_backend(Some(Arc::new(FakeBackend {
            state: Arc::clone(&state),
        })));
        set_soft_keyboard_style(SOFT_KEYBOARD_STYLE_DARK_KIND);
        assert_eq!(
            *state.style.lock().unwrap(),
            Some(SOFT_KEYBOARD_STYLE_DARK_KIND)
        );
        set_soft_keyboard_backend(None);
    }

    #[test]
    #[serial]
    fn set_soft_keyboard_style_is_noop_when_unsupported() {
        set_soft_keyboard_backend(Some(Arc::new(BareBackend)));
        set_soft_keyboard_style(SOFT_KEYBOARD_STYLE_DARK_KIND);
        set_soft_keyboard_backend(None);
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
