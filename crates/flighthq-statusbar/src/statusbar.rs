//! Status-bar free functions and backend management.
//!
//! Ports `@flighthq/statusbar`. The TS package always has a backend: a lazily
//! created web default, swappable by a native host. The web default is a
//! sentinel — only `set_background_color` is observable on a real web page (it
//! upserts a `<meta name="theme-color">` hint), and the rest no-op until a
//! native host registers a backend.
//!
//! In the Rust box there is no DOM, so the theme-color upsert is a `host-web`
//! concern (see TODO(align) on [`create_web_status_bar_backend`]). The native
//! default backend is a pure no-op sentinel, which keeps every function safe to
//! call before a host installs a real backend.

use flighthq_types::StatusBarBackend;
use flighthq_types::StatusBarStyle;
use std::sync::Arc;
use std::sync::Mutex;

/// Builds the default web status-bar backend.
///
/// Web pages have no true status bar, so every command is a sentinel no-op here.
/// On a real web page `set_background_color` would upsert a
/// `<meta name="theme-color">` hint derived from the top 24 bits of the packed
/// RGBA color; that DOM behavior is owned by `host-web`, not the native box.
///
// TODO(align): the TS web backend upserts a `<meta name="theme-color">` element
// in `set_background_color` (alpha dropped, `#rrggbb` from the top 24 bits).
// That logic is DOM-bound and belongs in `host-web`; the native default here is
// a pure no-op sentinel. See `packed_rgba_to_hex_color` for the color mapping.
pub fn create_web_status_bar_backend() -> Arc<dyn StatusBarBackend> {
    Arc::new(WebStatusBarBackend)
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

/// Installs a native host status-bar backend. Pass `None` to fall back to the
/// web default.
pub fn set_status_bar_backend(backend: Option<Arc<dyn StatusBarBackend>>) {
    let mut guard = BACKEND.lock().expect("status bar backend mutex poisoned");
    *guard = backend;
}

/// Sets the status-bar background color from a packed RGBA integer
/// (`0xRRGGBBAA`). On web this updates the theme-color hint; alpha is ignored.
pub fn set_status_bar_color(color: u32) {
    get_status_bar_backend().set_background_color(color);
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

/// Shows or hides the status bar. No-op on web.
pub fn set_status_bar_visible(visible: bool) {
    get_status_bar_backend().set_visible(visible);
}

static BACKEND: Mutex<Option<Arc<dyn StatusBarBackend>>> = Mutex::new(None);

struct WebStatusBarBackend;

impl StatusBarBackend for WebStatusBarBackend {
    fn set_style(&self, _style: StatusBarStyle) {
        // No web status bar; a native host is required to honor style.
    }

    fn set_visible(&self, _visible: bool) {
        // No web status bar; a native host is required to show/hide it.
    }

    fn set_background_color(&self, _color: u32) {
        // No DOM in the native box; the theme-color upsert lives in host-web.
        // See TODO(align) on create_web_status_bar_backend.
    }

    fn set_overlays_content(&self, _overlay: bool) {
        // No web status bar; a native host is required to control content overlay.
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

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::atomic::AtomicBool;
    use std::sync::atomic::AtomicU32;
    use std::sync::atomic::Ordering;

    #[derive(Default)]
    struct FakeBackend {
        style: Mutex<StatusBarStyle>,
        visible: AtomicBool,
        color: AtomicU32,
        overlay: AtomicBool,
    }

    impl FakeBackend {
        fn new() -> Self {
            FakeBackend {
                style: Mutex::new(StatusBarStyle::Default),
                visible: AtomicBool::new(true),
                color: AtomicU32::new(0),
                overlay: AtomicBool::new(false),
            }
        }
    }

    impl StatusBarBackend for FakeBackend {
        fn set_style(&self, style: StatusBarStyle) {
            *self.style.lock().expect("style mutex poisoned") = style;
        }
        fn set_visible(&self, visible: bool) {
            self.visible.store(visible, Ordering::SeqCst);
        }
        fn set_background_color(&self, color: u32) {
            self.color.store(color, Ordering::SeqCst);
        }
        fn set_overlays_content(&self, overlay: bool) {
            self.overlay.store(overlay, Ordering::SeqCst);
        }
    }

    // Mirrors the TS `afterEach(() => setStatusBarBackend(null))`.
    fn reset() {
        set_status_bar_backend(None);
    }

    mod create_web_status_bar_backend {
        use super::*;

        // The TS test asserts the web backend upserts a single `<meta
        // theme-color>` with `#aabbcc` from the top 24 bits. That DOM behavior
        // belongs to host-web; here we assert the pure color mapping the upsert
        // would use, which is the portable part of that assertion.
        #[test]
        fn maps_packed_rgba_to_hex_dropping_alpha() {
            assert_eq!(packed_rgba_to_hex_color(0x1122_3344), "#112233");
            assert_eq!(packed_rgba_to_hex_color(0xaabb_ccff), "#aabbcc");
        }

        #[test]
        #[serial]
        fn no_ops_style_visible_overlay_color_without_panicking() {
            let backend = create_web_status_bar_backend();
            backend.set_style(StatusBarStyle::Light);
            backend.set_visible(false);
            backend.set_overlays_content(true);
            backend.set_background_color(0x0011_2233);
        }
    }

    mod get_status_bar_backend {
        use super::*;

        #[test]
        #[serial]
        fn falls_back_to_a_web_backend() {
            reset();
            // Always returns a backend; calling it does not panic.
            get_status_bar_backend().set_visible(true);
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

    mod set_status_bar_backend {
        use super::*;

        #[test]
        #[serial]
        fn clears_back_to_the_web_fallback_when_passed_none() {
            set_status_bar_backend(Some(Arc::new(FakeBackend::new())));
            set_status_bar_backend(None);
            // Still returns a backend after clearing.
            get_status_bar_backend().set_visible(true);
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
            set_status_bar_color(0x1234_56ff);
            assert_eq!(backend.color.load(Ordering::SeqCst), 0x1234_56ff);
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
            assert_eq!(
                *backend.style.lock().expect("style mutex poisoned"),
                StatusBarStyle::Dark
            );
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
            set_status_bar_visible(false);
            assert!(!backend.visible.load(Ordering::SeqCst));
            reset();
        }
    }
}
