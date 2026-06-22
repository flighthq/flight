//! Tray free functions and backend management.

use flighthq_types::{MenuItemTemplate, TrayBackend, TrayEventType, TrayIconOptions};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// TrayIcon handle
// ---------------------------------------------------------------------------

/// An opaque handle to a system-tray icon created by the active [`TrayBackend`].
///
/// The `id` field is an integer assigned by the backend. Treat it as opaque;
/// the only meaningful operation is passing it back to tray functions.
/// A handle whose backend id is negative (`id < 0`) is invalid and must not be
/// used — [`create_tray_icon`] returns `None` in that case rather than exposing
/// an invalid handle.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub struct TrayIcon {
    pub id: i32,
}

// ---------------------------------------------------------------------------
// Web sentinel backend
// ---------------------------------------------------------------------------

/// Default web backend. Web has no system tray, so `create` returns `-1` and
/// all mutators are no-ops. A native host (Electron's `Tray`, Tauri) is
/// required for the tray icon itself.
pub struct WebTrayBackend;

impl TrayBackend for WebTrayBackend {
    fn create(&self, _options: &TrayIconOptions) -> i32 {
        // No tray on web. -1 signals "unsupported"; create_tray_icon maps it to None.
        -1
    }

    fn destroy(&self, _id: i32) {
        // No-op: web has no tray icon to destroy.
    }

    fn set_tooltip(&self, _id: i32, _tooltip: &str) {
        // No-op: web has no tray icon to update.
    }

    fn set_title(&self, _id: i32, _title: &str) {
        // No-op: web has no tray icon to update.
    }

    fn set_context_menu(&self, _id: i32, _items: &[MenuItemTemplate]) {
        // No-op: web has no tray icon — a native host is required.
    }

    fn subscribe(
        &self,
        _listener: Box<dyn Fn(i32, TrayEventType) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // No tray on web; a native host is required to emit tray events.
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active tray backend. Falls back to the web sentinel default when
/// no backend has been installed.
pub fn get_tray_backend() -> Arc<dyn TrayBackend> {
    let mut guard = BACKEND.lock().expect("tray backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(WebTrayBackend) as Arc<dyn TrayBackend>);
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// Installs a native host tray backend. Pass `None` to revert to the web
/// sentinel default.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_tray_backend(backend: Option<Arc<dyn TrayBackend>>) {
    let mut guard = BACKEND.lock().expect("tray backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a tray icon with the given options, or returns `None` when the host
/// has no system tray (e.g. web). The backend signals "unsupported" by returning
/// a negative id; this function translates that to a `None` sentinel.
pub fn create_tray_icon(options: &TrayIconOptions) -> Option<TrayIcon> {
    let id = get_tray_backend().create(options);
    if id < 0 { None } else { Some(TrayIcon { id }) }
}

/// Destroys a tray icon and frees its host resource. No-op when the host has no
/// tray (the icon's backend id would have been negative and no `TrayIcon` was
/// returned by `create_tray_icon`).
pub fn destroy_tray_icon(tray: TrayIcon) {
    get_tray_backend().destroy(tray.id);
}

/// Subscribes to tray icon events (click, right-click, double-click), delivering
/// the tray id and event type. Returns an unsubscribe function.
///
/// On web this never fires (no tray); a native host is required.
pub fn on_tray_event(
    listener: Box<dyn Fn(i32, TrayEventType) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_tray_backend().subscribe(listener)
}

/// Sets the context menu shown when the user right-clicks the tray icon. No-op
/// when the host has no tray (e.g. web).
pub fn set_tray_context_menu(tray: TrayIcon, items: &[MenuItemTemplate]) {
    get_tray_backend().set_context_menu(tray.id, items);
}

/// Sets the title text displayed next to the tray icon (macOS menu-bar text).
/// No-op when the host has no tray.
pub fn set_tray_icon_title(tray: TrayIcon, title: &str) {
    get_tray_backend().set_title(tray.id, title);
}

/// Sets the hover tooltip for the tray icon. No-op when the host has no tray.
pub fn set_tray_icon_tooltip(tray: TrayIcon, tooltip: &str) {
    get_tray_backend().set_tooltip(tray.id, tooltip);
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn TrayBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use serial_test::serial;

    use super::*;

    struct StubTrayBackend;

    impl TrayBackend for StubTrayBackend {
        fn create(&self, _options: &TrayIconOptions) -> i32 {
            0
        }
        fn destroy(&self, _id: i32) {}
        fn set_tooltip(&self, _id: i32, _tooltip: &str) {}
        fn set_title(&self, _id: i32, _title: &str) {}
        fn set_context_menu(&self, _id: i32, _items: &[MenuItemTemplate]) {}
        fn subscribe(
            &self,
            _listener: Box<dyn Fn(i32, TrayEventType) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
    }

    // create_tray_icon
    #[test]
    #[serial]
    fn create_tray_icon_returns_none_on_web() {
        set_tray_backend(None);
        assert!(create_tray_icon(&TrayIconOptions::default()).is_none());
    }

    #[test]
    #[serial]
    fn create_tray_icon_returns_some_with_native_backend() {
        set_tray_backend(Some(Arc::new(StubTrayBackend)));
        let icon = create_tray_icon(&TrayIconOptions::default());
        assert!(icon.is_some());
        set_tray_backend(None);
    }

    // destroy_tray_icon
    #[test]
    #[serial]
    fn destroy_tray_icon_does_not_panic() {
        set_tray_backend(Some(Arc::new(StubTrayBackend)));
        let icon = create_tray_icon(&TrayIconOptions::default()).unwrap();
        destroy_tray_icon(icon);
        set_tray_backend(None);
    }

    // get_tray_backend
    #[test]
    #[serial]
    fn get_tray_backend_returns_web_default() {
        set_tray_backend(None);
        let _backend = get_tray_backend();
    }

    // on_tray_event
    #[test]
    #[serial]
    fn on_tray_event_returns_unsubscribe() {
        set_tray_backend(None);
        let unsubscribe = on_tray_event(Box::new(|_id, _event| {}));
        unsubscribe();
    }

    // set_tray_backend
    #[test]
    #[serial]
    fn set_tray_backend_installs_custom() {
        set_tray_backend(Some(Arc::new(StubTrayBackend)));
        assert!(create_tray_icon(&TrayIconOptions::default()).is_some());
        set_tray_backend(None);
    }

    // set_tray_context_menu
    #[test]
    #[serial]
    fn set_tray_context_menu_does_not_panic_on_web() {
        set_tray_backend(None);
        // Calling with an arbitrary id is a no-op on web.
        set_tray_context_menu(TrayIcon { id: 0 }, &[]);
    }

    // set_tray_icon_title
    #[test]
    #[serial]
    fn set_tray_icon_title_does_not_panic_on_web() {
        set_tray_backend(None);
        set_tray_icon_title(TrayIcon { id: 0 }, "My App");
    }

    // set_tray_icon_tooltip
    #[test]
    #[serial]
    fn set_tray_icon_tooltip_does_not_panic_on_web() {
        set_tray_backend(None);
        set_tray_icon_tooltip(TrayIcon { id: 0 }, "Open");
    }
}
