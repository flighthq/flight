//! Screen enumeration free functions and backend management.

use flighthq_geometry::create_rectangle;
use flighthq_types::{Rectangle, ScreenBackend, ScreenInfo};
use std::sync::{Arc, Mutex};

/// Builds the default native backend. It reports the host's displays; the
/// fallback returns no screens until a native host (Electron/Tauri) replaces it
/// via [`set_screen_backend`] to enumerate every attached monitor.
pub fn create_native_screen_backend() -> Arc<dyn ScreenBackend> {
    Arc::new(NativeScreenBackend)
}

/// Allocates a zeroed [`ScreenInfo`]; use as the `out` for [`get_primary_screen`]
/// or as an array slot for [`get_screens`]. `scale_factor` defaults to `1` (no
/// scaling) and `is_primary` to false.
pub fn create_screen_info() -> ScreenInfo {
    ScreenInfo {
        scale_factor: 1.0,
        ..ScreenInfo::default()
    }
}

/// Fills `out` with the primary display and returns it. The fallback reports one
/// screen; a native host its OS-designated primary monitor.
pub fn get_primary_screen(out: &mut ScreenInfo) -> &mut ScreenInfo {
    let backend = get_screen_backend();
    backend.get_primary_screen(out)
}

/// Returns the active screen backend, lazily installing the native default when
/// none has been set. There is always a backend.
pub fn get_screen_backend() -> Arc<dyn ScreenBackend> {
    let mut guard = BACKEND.lock().expect("screen backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_native_screen_backend());
    }
    Arc::clone(guard.as_ref().expect("screen backend installed above"))
}

/// Returns the primary display's scale factor (device pixels per logical pixel),
/// or `1` when unknown. Convenience over [`get_primary_screen`].
pub fn get_screen_scale_factor() -> f32 {
    let mut scratch = create_screen_info();
    get_primary_screen(&mut scratch).scale_factor
}

/// Returns the primary display's work area — the usable region excluding system
/// chrome (taskbar/menu bar) — as a freshly allocated [`Rectangle`].
pub fn get_screen_work_area() -> Rectangle {
    let mut scratch = create_screen_info();
    let screen = get_primary_screen(&mut scratch);
    create_rectangle(screen.x, screen.y, screen.work_width, screen.work_height)
}

/// Fills `out` with every attached display and returns it. `out` is cleared and
/// repopulated; the fallback yields an empty list until a host registers.
pub fn get_screens(out: &mut Vec<ScreenInfo>) -> &mut Vec<ScreenInfo> {
    let backend = get_screen_backend();
    backend.get_screens(out);
    out
}

/// Subscribes to display/work-area/orientation changes via the active backend;
/// returns an unsubscribe closure.
pub fn on_screen_change(listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
    get_screen_backend().subscribe(listener)
}

/// Installs a native host screen backend; pass `None` to fall back to the native
/// default.
pub fn set_screen_backend(backend: Option<Arc<dyn ScreenBackend>>) {
    let mut guard = BACKEND.lock().expect("screen backend mutex poisoned");
    *guard = backend;
}

static BACKEND: Mutex<Option<Arc<dyn ScreenBackend>>> = Mutex::new(None);

/// Default backend; screen enumeration requires a window system, so this reports
/// clean sentinels — no screens and an untouched primary `out`. A native host
/// (winit/Electron/Tauri) replaces it via [`set_screen_backend`] to enumerate
/// every attached monitor.
struct NativeScreenBackend;

impl ScreenBackend for NativeScreenBackend {
    // Screen enumeration needs a window system std cannot provide, so the default
    // backend reports no screens. A host (winit/Electron/Tauri) replaces it.
    fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo> {
        out.clear();
        out
    }

    // No primary display without a window system; leave `out` untouched (its
    // zeroed/scale-1 fields are the sentinel) and return it, mirroring the web
    // backend's behavior when window/screen are absent.
    fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo {
        out
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Tests share the process-global BACKEND, so each resets it and serializes via
    // the shared lock to avoid cross-test interference.
    fn reset_backend() {
        set_screen_backend(None);
    }

    // Fake host backend reporting `count` displays, with a fireable change listener.
    struct FakeBackend {
        count: usize,
        listener: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
    }

    impl FakeBackend {
        fn new(count: usize) -> Arc<Self> {
            Arc::new(FakeBackend {
                count,
                listener: Mutex::new(None),
            })
        }

        fn fire(&self) {
            if let Some(listener) = self.listener.lock().unwrap().as_ref() {
                listener();
            }
        }
    }

    impl ScreenBackend for FakeBackend {
        fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo> {
            out.clear();
            for i in 0..self.count {
                out.push(ScreenInfo {
                    id: i as u32,
                    width: 100.0 + i as f32,
                    is_primary: i == 0,
                    scale_factor: 1.0,
                    ..ScreenInfo::default()
                });
            }
            out
        }

        fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo {
            out.id = 0;
            out.width = 100.0;
            out.is_primary = true;
            out
        }

        fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            *self.listener.lock().unwrap() = Some(listener);
            Box::new(|| {})
        }
    }

    #[test]
    #[serial]
    fn create_native_screen_backend_reports_sentinels() {
        let backend = create_native_screen_backend();

        let mut screens = Vec::new();
        backend.get_screens(&mut screens);
        assert!(screens.is_empty(), "default backend reports no screens");

        let mut primary = create_screen_info();
        primary.width = 42.0;
        backend.get_primary_screen(&mut primary);
        assert_eq!(primary.is_primary, false, "no OS primary without a host");
        assert_eq!(primary.scale_factor, 1.0);

        // subscribe returns a no-op unsubscribe and does not panic.
        let unsubscribe = backend.subscribe(Box::new(|| {}));
        unsubscribe();
    }

    #[test]
    #[serial]
    fn create_screen_info_zeroed_with_scale_one() {
        let info = create_screen_info();
        assert_eq!(info.scale_factor, 1.0);
        assert_eq!(info.is_primary, false);
        assert_eq!(info.width, 0.0);
        assert_eq!(info.height, 0.0);
    }

    #[test]
    #[serial]
    fn get_primary_screen_fills_and_returns_out() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(2)));
        let mut out = create_screen_info();
        get_primary_screen(&mut out);
        assert_eq!(out.is_primary, true);
        assert_eq!(out.width, 100.0);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_primary_screen_default_leaves_sentinel() {
        reset_backend();
        let mut out = create_screen_info();
        get_primary_screen(&mut out);
        assert_eq!(out.is_primary, false);
        assert_eq!(out.scale_factor, 1.0);
    }

    #[test]
    #[serial]
    fn get_screen_backend_falls_back_and_honors_registration() {
        reset_backend();
        // Always returns a backend (the lazy native default).
        let _default = get_screen_backend();

        let fake = FakeBackend::new(1);
        set_screen_backend(Some(Arc::clone(&fake) as Arc<dyn ScreenBackend>));
        let mut screens = Vec::new();
        get_screens(&mut screens);
        assert_eq!(screens.len(), 1, "registered backend is used");
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_scale_factor_defaults_to_one() {
        reset_backend();
        assert_eq!(get_screen_scale_factor(), 1.0);
    }

    #[test]
    #[serial]
    fn get_screen_work_area_default_is_zeroed() {
        reset_backend();
        let area = get_screen_work_area();
        assert_eq!(area.width, 0.0);
        assert_eq!(area.height, 0.0);
    }

    #[test]
    #[serial]
    fn get_screens_default_is_empty() {
        reset_backend();
        let mut out = Vec::new();
        get_screens(&mut out);
        assert!(out.is_empty(), "default backend enumerates no screens");
    }

    #[test]
    #[serial]
    fn get_screens_fills_to_count() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(3)));
        let mut out = Vec::new();
        get_screens(&mut out);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].is_primary, true);
        reset_backend();
    }

    #[test]
    #[serial]
    fn on_screen_change_delivers_and_unsubscribes() {
        reset_backend();
        let fake = FakeBackend::new(1);
        set_screen_backend(Some(Arc::clone(&fake) as Arc<dyn ScreenBackend>));

        let changes = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&changes);
        let unsubscribe = on_screen_change(Box::new(move || {
            counter.fetch_add(1, Ordering::SeqCst);
        }));
        fake.fire();
        assert_eq!(changes.load(Ordering::SeqCst), 1);
        unsubscribe();
        reset_backend();
    }

    #[test]
    #[serial]
    fn set_screen_backend_clears_to_default() {
        set_screen_backend(Some(FakeBackend::new(1)));
        set_screen_backend(None);
        // Falls back to the native default, which reports no screens.
        let mut out = Vec::new();
        get_screens(&mut out);
        assert!(out.is_empty());
    }
}
