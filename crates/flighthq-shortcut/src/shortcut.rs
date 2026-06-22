//! Shortcut free functions and backend management.

use flighthq_types::ShortcutBackend;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Web sentinel backend
// ---------------------------------------------------------------------------

/// Default web backend. Web pages cannot register OS-level global hotkeys, so
/// every operation returns a sentinel value rather than throwing. A native host
/// (Electron's `globalShortcut`, Tauri) is required to fulfill global shortcuts.
pub struct WebShortcutBackend;

impl ShortcutBackend for WebShortcutBackend {
    fn register(&self, _accelerator: &str, _listener: Box<dyn Fn() + Send + Sync>) -> bool {
        // Web has no global-hotkey capability.
        false
    }

    fn unregister(&self, _accelerator: &str) -> bool {
        // Web has no global-hotkey registry to remove from.
        false
    }

    fn unregister_all(&self) {
        // No-op: web has no global-hotkey registry to clear.
    }

    fn is_registered(&self, _accelerator: &str) -> bool {
        // Web has no global-hotkey capability.
        false
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active shortcut backend. Falls back to the web sentinel default
/// when no backend has been installed.
pub fn get_shortcut_backend() -> Arc<dyn ShortcutBackend> {
    let mut guard = BACKEND.lock().expect("shortcut backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(WebShortcutBackend) as Arc<dyn ShortcutBackend>);
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// Installs a native host shortcut backend. Pass `None` to revert to the web
/// sentinel default.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_shortcut_backend(backend: Option<Arc<dyn ShortcutBackend>>) {
    let mut guard = BACKEND.lock().expect("shortcut backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns `true` when the accelerator string is currently registered as a
/// global hotkey. Returns `false` on web (no global-hotkey support).
pub fn is_global_shortcut_registered(accelerator: &str) -> bool {
    get_shortcut_backend().is_registered(accelerator)
}

/// Registers a global hotkey. The `handler` closure is called when the user
/// triggers the accelerator.
///
/// Returns `false` when the host lacks global-hotkey support (e.g. web) or the
/// accelerator conflicts with an existing registration.
pub fn register_global_shortcut(accelerator: &str, handler: Box<dyn Fn() + Send + Sync>) -> bool {
    get_shortcut_backend().register(accelerator, handler)
}

/// Unregisters every previously registered global hotkey. No-op when the host
/// lacks global-hotkey support (e.g. web).
pub fn unregister_all_global_shortcuts() {
    get_shortcut_backend().unregister_all();
}

/// Unregisters a single global hotkey.
///
/// Returns `false` when the accelerator was not registered or the host lacks
/// global-hotkey support (e.g. web).
pub fn unregister_global_shortcut(accelerator: &str) -> bool {
    get_shortcut_backend().unregister(accelerator)
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn ShortcutBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct StubShortcutBackend;

    impl ShortcutBackend for StubShortcutBackend {
        fn register(&self, _accelerator: &str, _listener: Box<dyn Fn() + Send + Sync>) -> bool {
            true
        }
        fn unregister(&self, _accelerator: &str) -> bool {
            true
        }
        fn unregister_all(&self) {}
        fn is_registered(&self, _accelerator: &str) -> bool {
            false
        }
    }

    // get_shortcut_backend
    #[test]
    #[serial]
    fn get_shortcut_backend_returns_web_default() {
        // Clear any backend that a previous test may have installed.
        set_shortcut_backend(None);
        // The web sentinel is lazily created; this must not panic.
        let _backend = get_shortcut_backend();
    }

    // is_global_shortcut_registered
    #[test]
    #[serial]
    fn is_global_shortcut_registered_returns_false_on_web() {
        set_shortcut_backend(None);
        assert!(!is_global_shortcut_registered("CommandOrControl+X"));
    }

    // register_global_shortcut
    #[test]
    #[serial]
    fn register_global_shortcut_returns_false_on_web() {
        set_shortcut_backend(None);
        assert!(!register_global_shortcut(
            "CommandOrControl+X",
            Box::new(|| {})
        ));
    }

    // set_shortcut_backend
    #[test]
    #[serial]
    fn set_shortcut_backend_installs_custom() {
        set_shortcut_backend(Some(Arc::new(StubShortcutBackend)));
        // The stub reports true for register.
        assert!(register_global_shortcut(
            "CommandOrControl+Y",
            Box::new(|| {})
        ));
        set_shortcut_backend(None);
    }

    // unregister_all_global_shortcuts
    #[test]
    #[serial]
    fn unregister_all_global_shortcuts_does_not_panic() {
        set_shortcut_backend(None);
        unregister_all_global_shortcuts();
    }

    // unregister_global_shortcut
    #[test]
    #[serial]
    fn unregister_global_shortcut_returns_false_on_web() {
        set_shortcut_backend(None);
        assert!(!unregister_global_shortcut("CommandOrControl+X"));
    }
}
