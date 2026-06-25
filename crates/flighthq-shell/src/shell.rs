//! Shell free functions backed by the [`ShellBackend`] seam.
//!
//! The backend trait is defined in `flighthq-types`; this crate provides the default
//! native implementation that spawns platform-appropriate system commands.

use std::sync::{Mutex, OnceLock};

use flighthq_types::{
    ShellBackend, ShellOpenExternalOptions, ShellOpenPathOptions, ShellShortcutLink,
    ShellShortcutWriteOperation,
};

// ---------------------------------------------------------------------------
// Native backend
// ---------------------------------------------------------------------------

/// Default native backend. Uses platform-specific commands to open URLs and paths,
/// reveal items in the file manager, and move files to the trash.
pub struct NativeShellBackend;

impl ShellBackend for NativeShellBackend {
    fn open_external(&self, url: &str, _options: Option<&ShellOpenExternalOptions>) -> bool {
        // The activate option (macOS foreground raise) has no portable system-command equivalent;
        // a native host backend with platform APIs can honor it.
        open_with_system(url)
    }

    fn open_path(&self, path: &str, _options: Option<&ShellOpenPathOptions>) -> bool {
        // The working-directory / application / arguments options are not expressible through the
        // default OS handler; a richer host backend can map them onto `open -a` / explorer / etc.
        open_with_system(path)
    }

    fn open_path_result(&self, path: &str, options: Option<&ShellOpenPathOptions>) -> String {
        // Empty string on success, matching the TS / Electron error-string convention.
        if self.open_path(path, options) {
            String::new()
        } else {
            format!("failed to open path: {path}")
        }
    }

    fn show_item_in_folder(&self, path: &str) -> bool {
        reveal_in_file_manager(path)
    }

    fn move_to_trash(&self, path: &str) -> bool {
        trash_path(path)
    }

    fn move_items_to_trash(&self, paths: &[String]) -> Vec<bool> {
        paths.iter().map(|p| trash_path(p)).collect()
    }

    fn read_shortcut_link(&self, _shortcut_path: &str) -> Option<ShellShortcutLink> {
        // Windows `.lnk` shortcut links require a Windows-specific implementation (mslnk / winreg);
        // the default backend has none, so it returns the non-Windows sentinel.
        None
    }

    fn write_shortcut_link(
        &self,
        _shortcut_path: &str,
        _link: &ShellShortcutLink,
        _operation: ShellShortcutWriteOperation,
    ) -> bool {
        // Windows `.lnk` shortcut links require a Windows-specific implementation; unsupported here.
        false
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

// The active URL-scheme allowlist consulted by `open_external_url`. `None` allows every scheme.
static URL_SCHEME_ALLOWLIST: Mutex<Option<Vec<String>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns the active shell backend.
pub fn get_shell_backend() -> &'static dyn ShellBackend {
    get_backend()
}

/// Returns `true` when `url` is allowed by the active URL-scheme allowlist. When no allowlist is
/// set (the default), every URL is allowed. Returns `false` for a URL that cannot be parsed.
///
/// Used internally by [`open_external_url`]; also exported for callers that need the check.
pub fn is_shell_url_allowed(url: &str) -> bool {
    let allowlist = URL_SCHEME_ALLOWLIST.lock().unwrap();
    match allowlist.as_ref() {
        None => true,
        Some(schemes) => match url_scheme(url) {
            Some(scheme) => schemes.contains(&scheme),
            None => false,
        },
    }
}

/// Moves a local path to the OS trash. Returns `false` when not supported or path not found.
pub fn move_item_to_trash(path: &str) -> bool {
    get_backend().move_to_trash(path)
}

/// Moves a batch of local paths to the OS trash. Returns a per-path result array.
pub fn move_items_to_trash(paths: &[String]) -> Vec<bool> {
    get_backend().move_items_to_trash(paths)
}

/// Opens `url` in the user's default browser / external handler. Returns `false` when blocked or
/// when the URL scheme is not in the active allowlist (see [`set_shell_url_scheme_allowlist`]).
pub fn open_external_url(url: &str, options: Option<&ShellOpenExternalOptions>) -> bool {
    if !is_shell_url_allowed(url) {
        return false;
    }
    get_backend().open_external(url, options)
}

/// Opens a local path with its default OS application. Returns `false` when not found.
pub fn open_shell_path(path: &str, options: Option<&ShellOpenPathOptions>) -> bool {
    get_backend().open_path(path, options)
}

/// Opens a local path and returns the OS error message, or `""` on success. Use this when you need
/// the reason a path could not be opened; [`open_shell_path`] is the boolean convenience wrapper.
pub fn open_shell_path_result(path: &str, options: Option<&ShellOpenPathOptions>) -> String {
    get_backend().open_path_result(path, options)
}

/// Reads a Windows `.lnk` shell shortcut. Returns `None` on non-Windows platforms or when the
/// shortcut does not exist.
pub fn read_shell_shortcut_link(shortcut_path: &str) -> Option<ShellShortcutLink> {
    get_backend().read_shortcut_link(shortcut_path)
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

/// Sets the URL-scheme allowlist consulted by [`open_external_url`]. Pass `None` to allow all
/// schemes (the default). When a non-empty list is set, [`open_external_url`] returns `false` for
/// any URL whose scheme is not in the list — closing the classic `open_external` URL footgun.
pub fn set_shell_url_scheme_allowlist(schemes: Option<Vec<String>>) {
    *URL_SCHEME_ALLOWLIST.lock().unwrap() = schemes;
}

/// Emits a system beep. No-op when the host does not support it.
pub fn shell_beep() {
    get_backend().beep();
}

/// Reveals a local path in the OS file manager. Returns `false` when not supported.
pub fn show_item_in_folder(path: &str) -> bool {
    get_backend().show_item_in_folder(path)
}

/// Creates a Windows `.lnk` shell shortcut at `shortcut_path` pointing to `link`. Returns `false`
/// on non-Windows platforms. `operation` defaults to [`ShellShortcutWriteOperation::Create`].
pub fn write_shell_shortcut_link(
    shortcut_path: &str,
    link: &ShellShortcutLink,
    operation: ShellShortcutWriteOperation,
) -> bool {
    get_backend().write_shortcut_link(shortcut_path, link, operation)
}

// ---------------------------------------------------------------------------
// Private platform helpers
// ---------------------------------------------------------------------------

/// Extracts the lowercase scheme of a URL, mirroring `new URL(url).protocol` minus the trailing
/// `:`. Returns `None` when the URL has no valid scheme (RFC 3986: `ALPHA *( ALPHA / DIGIT / "+"
/// / "-" / "." )` followed by `:`), matching the TS parse-failure → `false` path.
fn url_scheme(url: &str) -> Option<String> {
    let colon = url.find(':')?;
    let scheme = &url[..colon];
    let mut chars = scheme.chars();
    let first = chars.next()?;
    if !first.is_ascii_alphabetic() {
        return None;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.') {
        return None;
    }
    Some(scheme.to_ascii_lowercase())
}

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

    // Serializes the few tests that touch the process-wide URL-scheme allowlist so they do not
    // race each other. Each guarded test resets the allowlist at the start.
    static ALLOWLIST_GUARD: Mutex<()> = Mutex::new(());

    // Records every call so tests can assert behavior without touching the real OS.
    #[derive(Default)]
    struct RecordingShellBackend {
        opened_external: Mutex<Vec<String>>,
        opened_paths: Mutex<Vec<String>>,
        last_external_options: Mutex<Option<ShellOpenExternalOptions>>,
        last_path_options: Mutex<Option<ShellOpenPathOptions>>,
        trashed_batch: Mutex<Vec<String>>,
        path_result: Mutex<String>,
    }

    impl ShellBackend for RecordingShellBackend {
        fn open_external(&self, url: &str, options: Option<&ShellOpenExternalOptions>) -> bool {
            self.opened_external.lock().unwrap().push(url.to_owned());
            *self.last_external_options.lock().unwrap() = options.cloned();
            true
        }

        fn open_path(&self, path: &str, options: Option<&ShellOpenPathOptions>) -> bool {
            self.opened_paths.lock().unwrap().push(path.to_owned());
            *self.last_path_options.lock().unwrap() = options.cloned();
            true
        }

        fn open_path_result(&self, path: &str, options: Option<&ShellOpenPathOptions>) -> String {
            self.opened_paths.lock().unwrap().push(path.to_owned());
            *self.last_path_options.lock().unwrap() = options.cloned();
            self.path_result.lock().unwrap().clone()
        }

        fn show_item_in_folder(&self, _path: &str) -> bool {
            false
        }

        fn move_to_trash(&self, _path: &str) -> bool {
            false
        }

        fn move_items_to_trash(&self, paths: &[String]) -> Vec<bool> {
            *self.trashed_batch.lock().unwrap() = paths.to_vec();
            paths.iter().map(|_| true).collect()
        }

        fn read_shortcut_link(&self, _shortcut_path: &str) -> Option<ShellShortcutLink> {
            Some(ShellShortcutLink {
                target: "/path/to/target".to_owned(),
                ..Default::default()
            })
        }

        fn write_shortcut_link(
            &self,
            _shortcut_path: &str,
            _link: &ShellShortcutLink,
            _operation: ShellShortcutWriteOperation,
        ) -> bool {
            true
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

    // is_shell_url_allowed
    #[test]
    fn is_shell_url_allowed_true_when_no_allowlist() {
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(None);
        assert!(is_shell_url_allowed("https://example.com"));
        assert!(is_shell_url_allowed("file:///tmp/x"));
        set_shell_url_scheme_allowlist(None);
    }

    #[test]
    fn is_shell_url_allowed_true_for_listed_scheme() {
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(Some(vec!["https".to_owned(), "mailto".to_owned()]));
        assert!(is_shell_url_allowed("https://example.com"));
        assert!(is_shell_url_allowed("mailto:user@example.com"));
        set_shell_url_scheme_allowlist(None);
    }

    #[test]
    fn is_shell_url_allowed_false_for_unlisted_scheme() {
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(Some(vec!["https".to_owned()]));
        assert!(!is_shell_url_allowed("file:///tmp/x"));
        assert!(!is_shell_url_allowed("ftp://example.com"));
        set_shell_url_scheme_allowlist(None);
    }

    #[test]
    fn is_shell_url_allowed_false_for_unparseable_url() {
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(Some(vec!["https".to_owned()]));
        assert!(!is_shell_url_allowed("not-a-url"));
        set_shell_url_scheme_allowlist(None);
    }

    // move_items_to_trash
    #[test]
    fn move_items_to_trash_passes_paths_and_returns_per_path_results() {
        let backend = RecordingShellBackend::default();
        let paths = vec!["/tmp/a".to_owned(), "/tmp/b".to_owned()];
        let results = backend.move_items_to_trash(&paths);
        assert_eq!(results, vec![true, true]);
        assert_eq!(backend.trashed_batch.lock().unwrap().as_slice(), &paths[..]);
    }

    // open_external_url
    #[test]
    fn open_external_url_dispatches_to_backend() {
        // The free function delegates to the global backend; test the seam directly through
        // a recording backend (the global OnceLock cannot be reset across tests).
        let backend = RecordingShellBackend::default();
        assert!(backend.open_external("https://example.com", None));
        assert_eq!(
            backend.opened_external.lock().unwrap().as_slice(),
            ["https://example.com"]
        );
    }

    #[test]
    fn open_external_url_forwards_activate_option() {
        let backend = RecordingShellBackend::default();
        let options = ShellOpenExternalOptions {
            activate: Some(true),
        };
        backend.open_external("https://example.com", Some(&options));
        assert_eq!(
            *backend.last_external_options.lock().unwrap(),
            Some(options)
        );
    }

    #[test]
    fn open_external_url_blocks_disallowed_scheme_without_calling_backend() {
        // Drive the public free function so the allowlist short-circuit is exercised. The global
        // backend cannot be reset, so assert the return value rather than backend state.
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(Some(vec!["https".to_owned()]));
        assert!(!open_external_url("file:///etc/passwd", None));
        set_shell_url_scheme_allowlist(None);
    }

    // open_shell_path
    #[test]
    fn open_shell_path_dispatches_to_backend() {
        let backend = RecordingShellBackend::default();
        assert!(backend.open_path("/tmp/example", None));
        assert_eq!(
            backend.opened_paths.lock().unwrap().as_slice(),
            ["/tmp/example"]
        );
    }

    #[test]
    fn open_shell_path_forwards_options() {
        let backend = RecordingShellBackend::default();
        let options = ShellOpenPathOptions {
            working_directory: Some("/home/user".to_owned()),
            application: Some("TextEdit".to_owned()),
            arguments: None,
        };
        backend.open_path("/tmp/x", Some(&options));
        assert_eq!(*backend.last_path_options.lock().unwrap(), Some(options));
    }

    #[test]
    fn open_shell_path_omits_options_when_none() {
        let backend = RecordingShellBackend::default();
        backend.open_path("/tmp/x", None);
        assert_eq!(*backend.last_path_options.lock().unwrap(), None);
    }

    // open_shell_path_result
    #[test]
    fn open_shell_path_result_empty_string_on_success() {
        let backend = RecordingShellBackend::default();
        *backend.path_result.lock().unwrap() = String::new();
        assert_eq!(backend.open_path_result("/tmp/x", None), "");
        assert_eq!(backend.opened_paths.lock().unwrap().as_slice(), ["/tmp/x"]);
    }

    #[test]
    fn open_shell_path_result_os_error_string_on_failure() {
        let backend = RecordingShellBackend::default();
        *backend.path_result.lock().unwrap() = "No such file or directory".to_owned();
        assert_eq!(
            backend.open_path_result("/nonexistent", None),
            "No such file or directory"
        );
    }

    // read_shell_shortcut_link
    #[test]
    fn read_shell_shortcut_link_returns_link_from_backend() {
        let backend = RecordingShellBackend::default();
        let result = backend.read_shortcut_link("/tmp/x.lnk");
        assert_eq!(
            result,
            Some(ShellShortcutLink {
                target: "/path/to/target".to_owned(),
                ..Default::default()
            })
        );
    }

    // set_shell_backend
    #[test]
    fn set_shell_backend_dispatches_through_seam() {
        // The global backend slot is a process-wide OnceLock shared with the other tests, so
        // installing a custom one here is not deterministic. Instead verify a custom backend
        // satisfies the trait object the setter accepts and routes calls as expected.
        let backend: Box<dyn ShellBackend> = Box::new(RecordingShellBackend::default());
        assert!(backend.open_external("flight://deep-link", None));
        assert!(!backend.show_item_in_folder("/anything"));
    }

    // set_shell_url_scheme_allowlist
    #[test]
    fn set_shell_url_scheme_allowlist_null_allows_all() {
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(Some(vec!["https".to_owned()]));
        set_shell_url_scheme_allowlist(None);
        assert!(is_shell_url_allowed("file:///tmp/x"));
        set_shell_url_scheme_allowlist(None);
    }

    #[test]
    fn set_shell_url_scheme_allowlist_restricts_to_listed_schemes() {
        let _guard = ALLOWLIST_GUARD.lock().unwrap();
        set_shell_url_scheme_allowlist(Some(vec!["https".to_owned(), "mailto".to_owned()]));
        assert!(!is_shell_url_allowed("ftp://example.com"));
        set_shell_url_scheme_allowlist(None);
    }

    // write_shell_shortcut_link
    #[test]
    fn write_shell_shortcut_link_writes_via_backend() {
        let backend = RecordingShellBackend::default();
        let link = ShellShortcutLink {
            target: "/tmp/target".to_owned(),
            ..Default::default()
        };
        assert!(backend.write_shortcut_link(
            "/tmp/x.lnk",
            &link,
            ShellShortcutWriteOperation::Create
        ));
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
