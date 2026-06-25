//! Status-bar free functions and backend management.
//!
//! Ports `@flighthq/statusbar`. The TS package always has a backend: a lazily
//! created web default, swappable by a native host. The web default is a
//! sentinel — only `set_background_color` is observable on a real web page (it
//! upserts a `<meta name="theme-color">` hint), and the rest no-op until a
//! native host registers a backend.
//!
//! In the Rust box there is no DOM, so the theme-color upsert / read-back is a
//! `host-web` concern (see TODO(align) on [`create_web_status_bar_backend`]).
//! The native default backend is a pure no-op/default-reading sentinel, which
//! keeps every function safe to call before a host installs a real backend.

use flighthq_signals::emit_signal;
use flighthq_types::StatusBar;
use flighthq_types::StatusBarAnimation;
use flighthq_types::StatusBarBackend;
use flighthq_types::StatusBarInfo;
use flighthq_types::StatusBarStyle;
use flighthq_types::StatusBarStyleEntry;
use flighthq_types::StatusBarStyleEntryHandle;
use std::sync::Arc;
use std::sync::Mutex;

/// Begins delivering OS-driven status bar changes to `bar`'s signals by
/// subscribing to the active backend. Idempotent: a prior subscription is torn
/// down first. Pair with [`detach_status_bar`] / [`dispose_status_bar`].
pub fn attach_status_bar(bar: &StatusBar) {
    detach_status_bar(bar);
    let backend = get_status_bar_backend();
    let on_change = bar.on_change.clone();
    let backend_clone = Arc::clone(&backend);
    let unsubscribe = backend.subscribe(Box::new(move || {
        let mut info = StatusBarInfo::default();
        backend_clone.get_info(&mut info);
        emit_signal(&on_change, &info);
    }));

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("status bar subscriptions mutex poisoned");
    // Use the StatusBar address as the subscription key.
    guard.push((bar as *const StatusBar as usize, unsubscribe));
}

/// Allocates a [`StatusBar`] event entity with inert signals; call
/// [`attach_status_bar`] to start delivery.
pub fn create_status_bar() -> StatusBar {
    StatusBar::default()
}

/// Allocates a zeroed [`StatusBarInfo`], suitable as the `out` for
/// [`get_status_bar_info`]. `height` defaults to -1 (unknown), `color` to 0
/// (transparent black), `style` to `Default`.
pub fn create_status_bar_info() -> StatusBarInfo {
    StatusBarInfo::default()
}

/// Builds the default web status-bar backend.
///
/// Web pages have no true status bar, so every command is a sentinel no-op here.
/// On a real web page `set_background_color` would upsert a
/// `<meta name="theme-color">` hint derived from the top 24 bits of the packed
/// RGBA color, and `get_info` would read that hint back; that DOM behavior is
/// owned by `host-web`, not the native box.
///
// TODO(align): the TS web backend upserts/reads a `<meta name="theme-color">`
// element (alpha dropped, `#rrggbb` from the top 24 bits; read-back forces alpha
// to 0xff). That logic is DOM-bound and belongs in `host-web`; the native
// default here is a pure no-op sentinel. See `packed_rgba_to_hex_color` /
// `hex_color_to_packed_rgba` for the portable color mapping.
pub fn create_web_status_bar_backend() -> Arc<dyn StatusBarBackend> {
    Arc::new(WebStatusBarBackend)
}

/// Stops delivery to `bar` and forgets its subscription. Safe to call when not
/// attached.
pub fn detach_status_bar(bar: &StatusBar) {
    let key = bar as *const StatusBar as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("status bar subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsub) = guard.remove(pos);
        unsub();
    }
}

/// Releases `bar` for garbage collection by detaching its backend subscription.
/// The signals remain plain GC-managed memory afterward.
pub fn dispose_status_bar(bar: &StatusBar) {
    detach_status_bar(bar);
}

/// Enables status bar signals for use with attach/detach. This is a no-op for
/// the import itself; it documents the explicit opt-in point for the signal
/// infrastructure.
pub fn enable_status_bar_signals() {
    // Signals are always available via flighthq-signals; this function is the
    // explicit opt-in marker callers use to document intent, and a hook point
    // for future setup if needed.
}

/// Returns the active status-bar backend, or a lazily created web default.
///
/// There is always a backend; this never returns a sentinel and never panics.
pub fn get_status_bar_backend() -> Arc<dyn StatusBarBackend> {
    let mut guard = BACKEND.lock().expect("status bar backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_web_status_bar_backend());
    }
    Arc::clone(guard.as_ref().expect("status bar backend just installed"))
}

/// Returns the status bar height in CSS pixels, or -1 when the host does not
/// report it (web, desktops). Convenience over [`get_status_bar_info`].
///
/// NOTE: On notched/island devices, the safe-area top inset (owned by
/// `flighthq-device`) may differ from the status bar height. Use the device
/// safe-area top inset for layout-safe top padding; use this when you
/// specifically need the status bar element's intrinsic height.
pub fn get_status_bar_height() -> f32 {
    let mut scratch = create_status_bar_info();
    get_status_bar_backend().get_info(&mut scratch);
    scratch.height
}

/// Fills `out` with the current status bar state snapshot and returns it.
/// Alias-safe: `out` may be the same object as any internal scratch.
pub fn get_status_bar_info(out: &mut StatusBarInfo) -> &mut StatusBarInfo {
    get_status_bar_backend().get_info(out)
}

/// Removes the style stack entry identified by `handle`. If the handle is
/// unknown or invalid, this is a no-op. The top entry (or baseline) is
/// re-applied after removal.
pub fn pop_status_bar_style_entry(handle: StatusBarStyleEntryHandle) {
    if handle == INVALID_HANDLE {
        return;
    }
    {
        let mut stack = STYLE_STACK.lock().expect("status bar style stack poisoned");
        match stack.iter().position(|(h, _)| *h == handle) {
            Some(idx) => {
                stack.remove(idx);
            }
            None => return,
        }
    }
    apply_top_style_entry();
}

/// Pushes a style stack entry, returns an opaque handle for later pop. Nested
/// components can push entries and restore the previous state on unmount without
/// global last-write-wins clashes. Unset fields fall through to the next entry
/// down the stack (last pushed wins per field).
pub fn push_status_bar_style_entry(entry: &StatusBarStyleEntry) -> StatusBarStyleEntryHandle {
    let handle = {
        let mut next = NEXT_HANDLE
            .lock()
            .expect("status bar handle mutex poisoned");
        let h = *next;
        *next += 1;
        let mut stack = STYLE_STACK.lock().expect("status bar style stack poisoned");
        stack.push((h, *entry));
        h
    };
    apply_top_style_entry();
    handle
}

/// Installs a native host status-bar backend. Pass `None` to fall back to the
/// web default.
pub fn set_status_bar_backend(backend: Option<Arc<dyn StatusBarBackend>>) {
    let mut guard = BACKEND.lock().expect("status bar backend mutex poisoned");
    *guard = backend;
}

/// Sets the status-bar background color from a packed RGBA integer
/// (`0xRRGGBBAA`). On web this updates the theme-color hint; alpha is ignored.
/// Set `animated` to true for a smooth transition (native hosts only; no-op on
/// web).
pub fn set_status_bar_color(color: u32, animated: bool) {
    get_status_bar_backend().set_background_color(color, animated);
}

/// Controls whether content draws under the status bar. No-op on web.
pub fn set_status_bar_overlays_content(overlay: bool) {
    get_status_bar_backend().set_overlays_content(overlay);
}

/// Sets the status-bar foreground style (`Light` | `Dark` | `Default`). No-op on
/// web.
pub fn set_status_bar_style(style: StatusBarStyle) {
    get_status_bar_backend().set_style(style);
}

/// Shows or hides the status bar. `animation` controls the transition. No-op on
/// web.
pub fn set_status_bar_visible(visible: bool, animation: StatusBarAnimation) {
    get_status_bar_backend().set_visible(visible, animation);
}

static BACKEND: Mutex<Option<Arc<dyn StatusBarBackend>>> = Mutex::new(None);
static NEXT_HANDLE: Mutex<StatusBarStyleEntryHandle> = Mutex::new(1);
#[allow(clippy::type_complexity)]
static STYLE_STACK: Mutex<Vec<(StatusBarStyleEntryHandle, StatusBarStyleEntry)>> =
    Mutex::new(Vec::new());
#[allow(clippy::type_complexity)]
static SUBSCRIPTIONS: Mutex<Vec<(usize, Box<dyn Fn() + Send + Sync>)>> = Mutex::new(Vec::new());

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;

struct WebStatusBarBackend;

impl StatusBarBackend for WebStatusBarBackend {
    fn get_info<'a>(&self, out: &'a mut StatusBarInfo) -> &'a mut StatusBarInfo {
        // No DOM in the native box; the theme-color read-back lives in host-web.
        // Return safe defaults: height -1 (unknown), color 0 (no hint set).
        out.color = 0;
        out.height = -1.0;
        out.overlays_content = false;
        out.style = StatusBarStyle::Default;
        out.visible = true;
        out
    }

    fn set_background_color(&self, _color: u32, _animated: bool) {
        // No DOM in the native box; the theme-color upsert lives in host-web.
        // See TODO(align) on create_web_status_bar_backend.
    }

    fn set_overlays_content(&self, _overlay: bool) {
        // No web status bar; a native host is required to control content overlay.
    }

    fn set_style(&self, _style: StatusBarStyle) {
        // No web status bar; a native host is required to honor style.
    }

    fn set_visible(&self, _visible: bool, _animation: StatusBarAnimation) {
        // No web status bar; a native host is required to show/hide it.
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        // No OS-driven status bar events on web; return a no-op unsubscribe.
        Box::new(|| {})
    }
}

/// Merges the style stack top-down (last pushed = highest priority per field)
/// and applies the merged result to the active backend. Falls through to no-ops
/// where no entry sets a field.
fn apply_top_style_entry() {
    let backend = get_status_bar_backend();
    let mut style: Option<StatusBarStyle> = None;
    let mut visible: Option<bool> = None;
    let mut color: Option<u32> = None;
    let mut overlays_content: Option<bool> = None;
    let mut animation: Option<StatusBarAnimation> = None;
    {
        let stack = STYLE_STACK.lock().expect("status bar style stack poisoned");
        // Stack is in push order; iterate from last pushed (top) to earliest (bottom).
        for (_, entry) in stack.iter().rev() {
            if style.is_none()
                && let Some(s) = entry.style
            {
                style = Some(s);
            }
            if visible.is_none()
                && let Some(v) = entry.visible
            {
                visible = Some(v);
            }
            if color.is_none()
                && let Some(c) = entry.color
            {
                color = Some(c);
            }
            if overlays_content.is_none()
                && let Some(o) = entry.overlays_content
            {
                overlays_content = Some(o);
            }
            if animation.is_none()
                && let Some(a) = entry.animation
            {
                animation = Some(a);
            }
        }
    }
    if let Some(s) = style {
        backend.set_style(s);
    }
    if let Some(v) = visible {
        backend.set_visible(v, animation.unwrap_or(StatusBarAnimation::None));
    }
    if let Some(c) = color {
        backend.set_background_color(c, false);
    }
    if let Some(o) = overlays_content {
        backend.set_overlays_content(o);
    }
}

/// Maps a packed RGBA integer (`0xRRGGBBAA`) to a `#rrggbb` CSS color string,
/// dropping alpha. This is the color mapping the web theme-color hint uses; the
/// hint itself lives in `host-web`, so this is only exercised by tests here.
#[cfg_attr(not(test), allow(dead_code))]
fn packed_rgba_to_hex_color(color: u32) -> String {
    let rgb = (color >> 8) & 0xff_ffff;
    format!("#{rgb:06x}")
}

/// Parses a `#rrggbb` CSS color string back to a packed RGBA integer
/// (`0xRRGGBBFF`, alpha forced opaque since the web theme-color hint drops it).
/// Returns 0 when the string is not a 6-digit `#rrggbb` value. Portable mirror
/// of the host-web read-back; only exercised by tests here.
#[cfg_attr(not(test), allow(dead_code))]
fn hex_color_to_packed_rgba(content: &str) -> u32 {
    let Some(hex) = content.strip_prefix('#') else {
        return 0;
    };
    if hex.len() != 6 {
        return 0;
    }
    match u32::from_str_radix(hex, 16) {
        Ok(rgb) => (rgb << 8) | 0xff,
        Err(_) => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::atomic::AtomicBool;
    use std::sync::atomic::AtomicU32;
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering;

    struct FakeBackend {
        style: Mutex<StatusBarStyle>,
        visible: AtomicBool,
        color: AtomicU32,
        animated_color: Mutex<Option<bool>>,
        animation: Mutex<Option<StatusBarAnimation>>,
        overlay: AtomicBool,
        info_height: Mutex<f32>,
        subscribe_call_count: AtomicUsize,
        // Shared so the returned unsubscribe closure can clear it, mirroring the
        // TS fake whose unsubscribe sets `listener = null`.
        listener: Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>,
    }

    impl FakeBackend {
        fn new() -> Self {
            FakeBackend {
                style: Mutex::new(StatusBarStyle::Default),
                visible: AtomicBool::new(true),
                color: AtomicU32::new(0),
                animated_color: Mutex::new(None),
                animation: Mutex::new(None),
                overlay: AtomicBool::new(false),
                info_height: Mutex::new(42.0),
                subscribe_call_count: AtomicUsize::new(0),
                listener: Arc::new(Mutex::new(None)),
            }
        }

        // Trigger for tests: fire the subscription listener externally.
        fn emit(&self) {
            let guard = self.listener.lock().expect("listener mutex poisoned");
            if let Some(l) = guard.as_ref() {
                l();
            }
        }
    }

    impl StatusBarBackend for FakeBackend {
        fn get_info<'a>(&self, out: &'a mut StatusBarInfo) -> &'a mut StatusBarInfo {
            out.color = self.color.load(Ordering::SeqCst);
            out.height = *self.info_height.lock().expect("info_height poisoned");
            out.overlays_content = self.overlay.load(Ordering::SeqCst);
            out.style = *self.style.lock().expect("style poisoned");
            out.visible = self.visible.load(Ordering::SeqCst);
            out
        }
        fn set_background_color(&self, color: u32, animated: bool) {
            self.color.store(color, Ordering::SeqCst);
            *self.animated_color.lock().expect("animated poisoned") = Some(animated);
        }
        fn set_overlays_content(&self, overlay: bool) {
            self.overlay.store(overlay, Ordering::SeqCst);
        }
        fn set_style(&self, style: StatusBarStyle) {
            *self.style.lock().expect("style poisoned") = style;
        }
        fn set_visible(&self, visible: bool, animation: StatusBarAnimation) {
            self.visible.store(visible, Ordering::SeqCst);
            *self.animation.lock().expect("animation poisoned") = Some(animation);
        }
        fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            self.subscribe_call_count.fetch_add(1, Ordering::SeqCst);
            *self.listener.lock().expect("listener poisoned") = Some(listener);
            // Unsubscribe clears the shared listener slot, matching the TS fake
            // whose returned closure sets `listener = null`.
            let slot = Arc::clone(&self.listener);
            Box::new(move || {
                *slot.lock().expect("listener poisoned") = None;
            })
        }
    }

    // Mirrors the TS `afterEach`: reset backend and drain the style stack.
    fn reset() {
        set_status_bar_backend(None);
        for i in 0..100 {
            pop_status_bar_style_entry(i);
        }
        // Clear any stragglers regardless of handle range.
        STYLE_STACK
            .lock()
            .expect("status bar style stack poisoned")
            .clear();
        SUBSCRIPTIONS
            .lock()
            .expect("status bar subscriptions mutex poisoned")
            .clear();
    }

    mod attach_status_bar {
        use super::*;

        #[test]
        #[serial]
        fn subscribes_and_emits_on_change_on_change() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            let bar = create_status_bar();
            let received: Arc<Mutex<Vec<StatusBarInfo>>> = Arc::new(Mutex::new(Vec::new()));
            let received_clone = Arc::clone(&received);
            let _guard = flighthq_signals::connect_signal(
                &bar.on_change,
                Arc::new(move |info: &StatusBarInfo| {
                    received_clone.lock().unwrap().push(*info);
                }),
                Default::default(),
            );
            attach_status_bar(&bar);
            backend.emit();
            let got = received.lock().unwrap();
            assert_eq!(got.len(), 1);
            assert_eq!(got[0].height, 42.0);
            drop(got);
            dispose_status_bar(&bar);
            reset();
        }

        #[test]
        #[serial]
        fn is_idempotent_re_attaching_replaces_the_subscription() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            let bar = create_status_bar();
            attach_status_bar(&bar);
            attach_status_bar(&bar);
            assert_eq!(backend.subscribe_call_count.load(Ordering::SeqCst), 2);
            dispose_status_bar(&bar);
            reset();
        }
    }

    mod create_status_bar {
        use super::*;

        #[test]
        #[serial]
        fn returns_a_status_bar_with_an_inert_on_change_signal() {
            let bar = create_status_bar();
            // Signal exists and is inert (no listeners) until attach.
            emit_signal(&bar.on_change, &StatusBarInfo::default());
        }
    }

    mod create_status_bar_info {
        use super::*;

        #[test]
        fn returns_defaults_with_height_minus_one_and_style_default() {
            let info = create_status_bar_info();
            assert_eq!(info.height, -1.0);
            assert_eq!(info.style, StatusBarStyle::Default);
            assert!(info.visible);
            assert!(!info.overlays_content);
            assert_eq!(info.color, 0);
        }
    }

    mod create_web_status_bar_backend {
        use super::*;

        // The TS test asserts the web backend upserts/reads a `<meta
        // theme-color>` with `#aabbcc` from the top 24 bits. That DOM behavior
        // belongs to host-web; here we assert the pure color mapping the upsert
        // would use, which is the portable part of that assertion.
        #[test]
        fn maps_packed_rgba_to_hex_dropping_alpha() {
            assert_eq!(packed_rgba_to_hex_color(0x1122_3344), "#112233");
            assert_eq!(packed_rgba_to_hex_color(0xaabb_ccff), "#aabbcc");
        }

        #[test]
        fn reads_hex_back_to_packed_rgba_forcing_alpha_opaque() {
            // Mirrors the TS read-back: 0xff0000 → 0xff0000ff.
            assert_eq!(hex_color_to_packed_rgba("#ff0000"), 0xff00_00ff);
            assert_eq!(hex_color_to_packed_rgba("not-a-color"), 0);
            assert_eq!(hex_color_to_packed_rgba("#abc"), 0);
        }

        #[test]
        #[serial]
        fn no_ops_style_visible_overlay_subscribe_without_panicking() {
            let backend = create_web_status_bar_backend();
            backend.set_style(StatusBarStyle::Light);
            backend.set_visible(false, StatusBarAnimation::Slide);
            backend.set_overlays_content(true);
            backend.set_background_color(0x0011_2233, false);
            let unsub = backend.subscribe(Box::new(|| {}));
            unsub();
        }

        #[test]
        #[serial]
        fn get_info_returns_minus_one_height_and_defaults() {
            let backend = create_web_status_bar_backend();
            let mut info = create_status_bar_info();
            backend.get_info(&mut info);
            assert_eq!(info.height, -1.0);
            assert!(info.visible);
            assert_eq!(info.color, 0);
        }

        #[test]
        #[serial]
        fn subscribe_returns_a_no_op_unsubscribe() {
            let backend = create_web_status_bar_backend();
            let unsub = backend.subscribe(Box::new(|| {}));
            unsub(); // does not panic
        }
    }

    mod detach_status_bar {
        use super::*;

        #[test]
        #[serial]
        fn stops_subscription_and_is_safe_when_not_attached() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            let bar = create_status_bar();
            detach_status_bar(&bar); // safe when not attached
            let emit_count: Arc<AtomicUsize> = Arc::new(AtomicUsize::new(0));
            let emit_clone = Arc::clone(&emit_count);
            let _guard = flighthq_signals::connect_signal(
                &bar.on_change,
                Arc::new(move |_: &StatusBarInfo| {
                    emit_clone.fetch_add(1, Ordering::SeqCst);
                }),
                Default::default(),
            );
            attach_status_bar(&bar);
            detach_status_bar(&bar);
            backend.emit();
            assert_eq!(emit_count.load(Ordering::SeqCst), 0);
            reset();
        }
    }

    mod dispose_status_bar {
        use super::*;

        #[test]
        #[serial]
        fn detaches_subscription_and_releases_the_entity() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            let bar = create_status_bar();
            let emit_count: Arc<AtomicUsize> = Arc::new(AtomicUsize::new(0));
            let emit_clone = Arc::clone(&emit_count);
            let _guard = flighthq_signals::connect_signal(
                &bar.on_change,
                Arc::new(move |_: &StatusBarInfo| {
                    emit_clone.fetch_add(1, Ordering::SeqCst);
                }),
                Default::default(),
            );
            attach_status_bar(&bar);
            dispose_status_bar(&bar);
            backend.emit();
            assert_eq!(emit_count.load(Ordering::SeqCst), 0);
            reset();
        }
    }

    mod enable_status_bar_signals {
        use super::*;

        #[test]
        fn is_callable_without_panicking() {
            enable_status_bar_signals();
        }
    }

    mod get_status_bar_backend {
        use super::*;

        #[test]
        #[serial]
        fn falls_back_to_a_web_backend() {
            reset();
            // Always returns a backend; calling it does not panic.
            get_status_bar_backend().set_visible(true, StatusBarAnimation::None);
        }

        #[test]
        #[serial]
        fn returns_the_registered_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            assert!(Arc::ptr_eq(
                &(get_status_bar_backend() as Arc<dyn StatusBarBackend>),
                &(backend as Arc<dyn StatusBarBackend>)
            ));
            reset();
        }
    }

    mod get_status_bar_height {
        use super::*;

        #[test]
        #[serial]
        fn returns_the_height_from_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend));
            assert_eq!(get_status_bar_height(), 42.0);
            reset();
        }

        #[test]
        #[serial]
        fn returns_minus_one_when_the_web_backend_reports_unknown_height() {
            reset();
            // Web backend always returns -1 for height.
            assert_eq!(get_status_bar_height(), -1.0);
            reset();
        }
    }

    mod get_status_bar_info {
        use super::*;

        #[test]
        #[serial]
        fn fills_the_out_parameter_from_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            backend.color.store(0x1122_33ff, Ordering::SeqCst);
            *backend.style.lock().unwrap() = StatusBarStyle::Light;
            backend.visible.store(false, Ordering::SeqCst);
            backend.overlay.store(true, Ordering::SeqCst);
            set_status_bar_backend(Some(backend));
            let mut out = create_status_bar_info();
            get_status_bar_info(&mut out);
            assert_eq!(out.color, 0x1122_33ff);
            assert_eq!(out.style, StatusBarStyle::Light);
            assert!(!out.visible);
            assert!(out.overlays_content);
            assert_eq!(out.height, 42.0);
            reset();
        }

        #[test]
        #[serial]
        fn is_alias_safe_out_may_be_reused_across_calls() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            let mut out = create_status_bar_info();
            get_status_bar_info(&mut out);
            *backend.style.lock().unwrap() = StatusBarStyle::Dark;
            get_status_bar_info(&mut out);
            assert_eq!(out.style, StatusBarStyle::Dark);
            reset();
        }
    }

    mod pop_status_bar_style_entry {
        use super::*;

        #[test]
        #[serial]
        fn no_ops_for_unknown_or_invalid_handles() {
            reset();
            pop_status_bar_style_entry(-1);
            pop_status_bar_style_entry(99999);
            reset();
        }

        #[test]
        #[serial]
        fn removes_the_entry_and_re_applies_the_stack() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            let handle = push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Dark),
                ..Default::default()
            });
            assert_eq!(*backend.style.lock().unwrap(), StatusBarStyle::Dark);
            pop_status_bar_style_entry(handle);
            // The push was applied, the pop does not panic.
            reset();
        }
    }

    mod push_status_bar_style_entry {
        use super::*;

        #[test]
        #[serial]
        fn applies_the_entry_to_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Light),
                visible: Some(false),
                ..Default::default()
            });
            assert_eq!(*backend.style.lock().unwrap(), StatusBarStyle::Light);
            assert!(!backend.visible.load(Ordering::SeqCst));
            reset();
        }

        #[test]
        #[serial]
        fn later_entries_win_per_field_over_earlier_entries() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Dark),
                ..Default::default()
            });
            push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Light),
                ..Default::default()
            });
            assert_eq!(*backend.style.lock().unwrap(), StatusBarStyle::Light);
            reset();
        }

        #[test]
        #[serial]
        fn returns_unique_handles() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend));
            let h1 = push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Dark),
                ..Default::default()
            });
            let h2 = push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Light),
                ..Default::default()
            });
            assert_ne!(h1, h2);
            pop_status_bar_style_entry(h1);
            pop_status_bar_style_entry(h2);
            reset();
        }

        #[test]
        #[serial]
        fn fields_not_set_fall_through_to_lower_entries() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            push_status_bar_style_entry(&StatusBarStyleEntry {
                style: Some(StatusBarStyle::Dark),
                ..Default::default()
            });
            push_status_bar_style_entry(&StatusBarStyleEntry {
                visible: Some(false),
                ..Default::default()
            });
            assert_eq!(*backend.style.lock().unwrap(), StatusBarStyle::Dark);
            assert!(!backend.visible.load(Ordering::SeqCst));
            reset();
        }
    }

    mod set_status_bar_backend {
        use super::*;

        #[test]
        #[serial]
        fn clears_back_to_the_web_fallback_when_passed_none() {
            set_status_bar_backend(Some(Arc::new(FakeBackend::new())));
            set_status_bar_backend(None);
            // Still returns a backend after clearing.
            get_status_bar_backend().set_visible(true, StatusBarAnimation::None);
            reset();
        }
    }

    mod set_status_bar_color {
        use super::*;

        #[test]
        #[serial]
        fn forwards_the_packed_color_to_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            set_status_bar_color(0x1234_56ff, false);
            assert_eq!(backend.color.load(Ordering::SeqCst), 0x1234_56ff);
            assert_eq!(*backend.animated_color.lock().unwrap(), Some(false));
            reset();
        }

        #[test]
        #[serial]
        fn forwards_the_animated_flag_when_provided() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            set_status_bar_color(0x1234_56ff, true);
            assert_eq!(*backend.animated_color.lock().unwrap(), Some(true));
            reset();
        }
    }

    mod set_status_bar_overlays_content {
        use super::*;

        #[test]
        #[serial]
        fn forwards_overlay_to_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            set_status_bar_overlays_content(true);
            assert!(backend.overlay.load(Ordering::SeqCst));
            reset();
        }
    }

    mod set_status_bar_style {
        use super::*;

        #[test]
        #[serial]
        fn forwards_style_to_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            set_status_bar_style(StatusBarStyle::Dark);
            assert_eq!(*backend.style.lock().unwrap(), StatusBarStyle::Dark);
            reset();
        }
    }

    mod set_status_bar_visible {
        use super::*;

        #[test]
        #[serial]
        fn forwards_visibility_to_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            set_status_bar_visible(false, StatusBarAnimation::None);
            assert!(!backend.visible.load(Ordering::SeqCst));
            reset();
        }

        #[test]
        #[serial]
        fn forwards_animation_parameter_to_the_active_backend() {
            reset();
            let backend = Arc::new(FakeBackend::new());
            set_status_bar_backend(Some(backend.clone()));
            set_status_bar_visible(false, StatusBarAnimation::Fade);
            assert_eq!(
                *backend.animation.lock().unwrap(),
                Some(StatusBarAnimation::Fade)
            );
            reset();
        }
    }
}
