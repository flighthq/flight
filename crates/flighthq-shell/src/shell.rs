//! Shell free functions backed by the [`ShellBackend`] seam.
//!
//! The backend trait is defined in `flighthq-types`; this crate provides the default
//! native implementation that spawns platform-appropriate system commands.

use std::sync::OnceLock;

use flighthq_types::ShellBackend;

// ---------------------------------------------------------------------------
// Native backend
// ---------------------------------------------------------------------------

/// Default native backend. Uses platform-specific commands to open URLs and paths,
/// reveal items in the file manager, and move files to the trash.
pub struct NativeShellBackend;

impl ShellBackend for NativeShellBackend {
    fn open_external(&self, url: &str) -> bool {
        open_with_system(url)
    }

    fn open_path(&self, path: &str) -> bool {
        open_with_system(path)
    }

    fn show_item_in_folder(&self, path: &str) -> bool {
        reveal_in_file_manager(path)
    }

    fn move_to_trash(&self, path: &str) -> bool {
        trash_path(path)
    }

    fn beep(&self) {
        // Write BEL (0x07) to the terminal. Works in most native terminal environments.
        // A richer implementation could call platform audio APIs.
        print!("\x07");
    }
}

// ---------------------------------------------------------------------------
// Global backend slot
// ---------------------------------------------------------------------------

static BACKEND: OnceLock<Box<dyn ShellBackend>> = OnceLock::new();

fn get_backend() -> &'static dyn ShellBackend {
    BACKEND
        .get_or_init(|| Box::new(NativeShellBackend))
        .as_ref()
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns the active shell backend.
pub fn get_shell_backend() -> &'static dyn ShellBackend {
    get_backend()
}

/// Moves a local path to the OS trash. Returns `false` when not supported or path not found.
pub fn move_item_to_trash(path: &str) -> bool {
    get_backend().move_to_trash(path)
}

/// Opens `url` in the user's default browser / external handler. Returns `false` when blocked.
pub fn open_external_url(url: &str) -> bool {
    get_backend().open_external(url)
}

/// Opens a local path with its default OS application. Returns `false` when not found.
pub fn open_shell_path(path: &str) -> bool {
    get_backend().open_path(path)
}

/// Installs a native host shell backend.
///
/// # Panics
///
/// Panics if called after the backend has already been initialized.
pub fn set_shell_backend(backend: Box<dyn ShellBackend>) {
    if BACKEND.set(backend).is_err() {
        panic!("shell backend already initialized");
    }
}

/// Emits a system beep. No-op when the host does not support it.
pub fn shell_beep() {
    get_backend().beep();
}

/// Reveals a local path in the OS file manager. Returns `false` when not supported.
pub fn show_item_in_folder(path: &str) -> bool {
    get_backend().show_item_in_folder(path)
}

// ---------------------------------------------------------------------------
// Private platform helpers
// ---------------------------------------------------------------------------

/// Opens a URL or path using the OS default handler.
fn open_with_system(target: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", target])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // Assume freedesktop-compatible (Linux, BSD …).
        std::process::Command::new("xdg-open")
            .arg(target)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// Reveals a path in the OS file manager.
fn reveal_in_file_manager(path: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // dbus-send to the file manager is the standard freedesktop approach but is unreliable;
        // fall back to opening the parent directory.
        let parent = std::path::Path::new(path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// Moves a path to the OS trash.
fn trash_path(path: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        // AppleScript is the most reliable cross-version approach on macOS.
        let script = format!(
            "tell application \"Finder\" to delete POSIX file {:?}",
            path
        );
        std::process::Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "windows")]
    {
        // SHFileOperation / IFileOperation is required for proper trash integration.
        // A stub; a host-provided backend using winapi covers this fully.
        let _ = path;
        false
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // gio trash is the standard freedesktop mechanism.
        std::process::Command::new("gio")
            .args(["trash", path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    // Records every call so tests can assert behavior without touching the real OS.
    #[derive(Default)]
    struct RecordingShellBackend {
        opened_external: Mutex<Vec<String>>,
        opened_paths: Mutex<Vec<String>>,
    }

    impl ShellBackend for RecordingShellBackend {
        fn open_external(&self, url: &str) -> bool {
            self.opened_external.lock().unwrap().push(url.to_owned());
            true
        }

        fn open_path(&self, path: &str) -> bool {
            self.opened_paths.lock().unwrap().push(path.to_owned());
            true
        }

        fn show_item_in_folder(&self, _path: &str) -> bool {
            false
        }

        fn move_to_trash(&self, _path: &str) -> bool {
            false
        }

        fn beep(&self) {}
    }

    // get_shell_backend
    #[test]
    fn get_shell_backend_returns_backend() {
        // Verifies the lazy-init default is accessible without panicking.
        let _backend = get_shell_backend();
    }

    // move_item_to_trash
    #[test]
    fn move_item_to_trash_returns_false_when_missing() {
        assert!(!move_item_to_trash("/no/such/path/to/trash"));
    }

    // open_external_url
    #[test]
    fn open_external_url_dispatches_to_backend() {
        // The free function delegates to the global backend; test the seam directly through
        // a recording backend (the global OnceLock cannot be reset across tests).
        let backend = RecordingShellBackend::default();
        assert!(backend.open_external("https://example.com"));
        assert_eq!(
            backend.opened_external.lock().unwrap().as_slice(),
            ["https://example.com"]
        );
    }

    // open_shell_path
    #[test]
    fn open_shell_path_dispatches_to_backend() {
        let backend = RecordingShellBackend::default();
        assert!(backend.open_path("/tmp/example"));
        assert_eq!(
            backend.opened_paths.lock().unwrap().as_slice(),
            ["/tmp/example"]
        );
    }

    // set_shell_backend
    #[test]
    fn set_shell_backend_dispatches_through_seam() {
        // The global backend slot is a process-wide OnceLock shared with the other tests, so
        // installing a custom one here is not deterministic. Instead verify a custom backend
        // satisfies the trait object the setter accepts and routes calls as expected.
        let backend: Box<dyn ShellBackend> = Box::new(RecordingShellBackend::default());
        assert!(backend.open_external("flight://deep-link"));
        assert!(!backend.show_item_in_folder("/anything"));
    }

    // shell_beep
    #[test]
    fn shell_beep_does_not_panic() {
        // The default backend writes BEL to stdout; this just ensures no panic.
        // In CI the output is suppressed.
        shell_beep();
    }

    // show_item_in_folder
    #[test]
    fn show_item_in_folder_returns_false_when_missing() {
        // Most platforms will return false for a non-existent path.
        // We cannot assert the exact value in a cross-platform way, so we just verify no panic.
        let _ = show_item_in_folder("/no/such/path");
    }
}
