//! App free functions and backend management.
//!
//! The [`AppBackend`] seam is defined in `flighthq-types`; this crate supplies the
//! default backend. Unlike the TypeScript SDK — whose ambient default is the web —
//! the Rust ambient default is native/std: [`NativeAppBackend`] serves application
//! identity, lifecycle control, and a file-based single-instance lock using only
//! `std`. Capabilities `std` cannot serve (dock badge/menu/bounce, foreground
//! focus, host-driven activate/open-file/second-instance events) return clean
//! sentinels (`""`/`false`/`-1`/no-op) and are filled by a native host backend.

use std::sync::{Arc, Mutex};

use flighthq_signals::{emit_signal, emit_signal_cancellable};
use flighthq_types::{
    App, AppActivationPolicy, AppBackend, AppLoginItem, AppLoginItemLike, AppPathKind,
    MenuItemTemplate,
};

// ---------------------------------------------------------------------------
// App entity lifecycle
// ---------------------------------------------------------------------------

/// Adds a path to the system's recent-documents list (Jump List on Windows;
/// macOS recents). No-op on web and platforms without a recents list.
pub fn add_app_recent_document(path: &str) {
    get_app_backend().add_recent_document(path);
}

/// Begins delivering app events to `app`'s signals by subscribing to the active
/// backend. Wires `subscribe_activate` → `on_activate`,
/// `subscribe_open_file` → `on_open_file`,
/// `subscribe_second_instance` → `on_second_instance`. Idempotent: a prior
/// subscription is torn down first. Pair with [`detach_app`]/[`dispose_app`].
pub fn attach_app(app: &App) {
    detach_app(app);
    let backend = get_app_backend();

    let sig_activate = app.on_activate.clone();
    let sig_all_closed = app.on_all_windows_closed.clone();
    let sig_open_file = app.on_open_file.clone();
    let sig_quit_request = app.on_quit_request.clone();
    let sig_ready = app.on_ready.clone();
    let sig_second = app.on_second_instance.clone();
    let quit_backend = Arc::clone(&backend);

    let unsub_activate = backend.subscribe_activate(Box::new(move || {
        emit_signal(&sig_activate, &());
    }));
    let unsub_all_closed = backend.subscribe_all_windows_closed(Box::new(move || {
        emit_signal(&sig_all_closed, &());
    }));
    let unsub_open_file = backend.subscribe_open_file(Box::new(move |path: String| {
        emit_signal(&sig_open_file, &path);
    }));
    let unsub_quit_request = backend.subscribe_quit_request(Box::new(
        move |cancel_host: Box<dyn Fn() + Send + Sync>| {
            if emit_signal_cancellable(&sig_quit_request, &()) {
                // A Flight listener vetoed the quit — cancel at the host level too so that a native
                // host (Electron and others) can call event.preventDefault() and prevent the OS from
                // forcing a quit.
                cancel_host();
            } else {
                quit_backend.quit();
            }
        },
    ));
    let unsub_ready = backend.subscribe_ready(Box::new(move || {
        emit_signal(&sig_ready, &());
    }));
    let unsub_second = backend.subscribe_second_instance(Box::new(move |argv: Vec<String>| {
        emit_signal(&sig_second, &argv);
    }));

    // Keyed by the App's address (used only as a map key, never dereferenced),
    // mirroring the TS WeakMap<App, () => void> subscription registry.
    let app_ptr = app as *const App as usize;
    let mut subs = SUBSCRIPTIONS
        .lock()
        .expect("app subscriptions mutex poisoned");
    subs.push(AppSubscription {
        app_ptr,
        unsubscribes: vec![
            unsub_activate,
            unsub_all_closed,
            unsub_open_file,
            unsub_quit_request,
            unsub_ready,
            unsub_second,
        ],
    });
}

/// Starts a dock bounce; returns a request id usable with
/// [`cancel_app_dock_bounce`], or `-1` when unsupported.
pub fn bounce_app_dock() -> i32 {
    get_app_backend().bounce_dock()
}

/// Cancels an app-level attention request previously started by
/// [`request_app_attention`]. No-op on web.
pub fn cancel_app_attention(id: i32) {
    get_app_backend().cancel_attention(id);
}

/// Cancels a dock bounce previously started by [`bounce_app_dock`].
pub fn cancel_app_dock_bounce(id: i32) {
    get_app_backend().cancel_dock_bounce(id);
}

/// Clears the system's recent-documents list (Jump List / macOS recents).
/// No-op on web.
pub fn clear_app_recent_documents() {
    get_app_backend().clear_recent_documents();
}

/// Allocates an [`App`] event entity with inert signals. Call [`attach_app`] to
/// start delivery.
pub fn create_app() -> App {
    App::default()
}

/// Allocates an [`AppLoginItem`] with default values.
pub fn create_app_login_item() -> AppLoginItem {
    AppLoginItem::default()
}

/// Stops delivery to `app` and forgets its subscription. Safe to call when not
/// attached.
pub fn detach_app(app: &App) {
    let app_ptr = app as *const App as usize;
    let removed: Vec<AppSubscription> = {
        let mut subs = SUBSCRIPTIONS
            .lock()
            .expect("app subscriptions mutex poisoned");
        let mut removed = Vec::new();
        let mut kept = Vec::with_capacity(subs.len());
        for sub in subs.drain(..) {
            if sub.app_ptr == app_ptr {
                removed.push(sub);
            } else {
                kept.push(sub);
            }
        }
        *subs = kept;
        removed
    };
    // Invoke each backend unsubscribe after releasing the registry lock, so a
    // backend that re-enters app functions during teardown cannot deadlock.
    for sub in &removed {
        sub.invoke_unsubscribes();
    }
}

/// Releases `app` for garbage collection by detaching its backend subscription.
/// The signals remain plain GC-managed memory afterward.
pub fn dispose_app(app: &App) {
    detach_app(app);
}

/// Brings the application to the foreground.
pub fn focus_app() {
    get_app_backend().focus();
}

/// Returns the active app backend. Lazily installs the native default backend
/// when none has been set. There is always a backend.
pub fn get_app_backend() -> Arc<dyn AppBackend> {
    let mut guard = BACKEND.lock().expect("app backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(NativeAppBackend::new()));
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// The command-line arguments for this process, or `[]` on web.
pub fn get_app_command_line() -> Vec<String> {
    get_app_backend().get_command_line()
}

/// The value of a named command-line switch, or `None` when the switch is
/// absent. A bare `--name` flag yields `Some("")`; `--name=value` yields
/// `Some("value")`.
pub fn get_app_command_line_switch(name: &str) -> Option<String> {
    let prefix = format!("--{name}=");
    let bare = format!("--{name}");
    for arg in get_app_backend().get_command_line() {
        if arg == bare {
            return Some(String::new());
        }
        if let Some(value) = arg.strip_prefix(&prefix) {
            return Some(value.to_owned());
        }
    }
    None
}

/// The app-identity-relative directory path for the given kind
/// (`UserData`/`Logs`/`CrashDumps`); `""` on web. Bare OS directories (home,
/// documents, downloads, …) live in `flighthq-filesystem`.
pub fn get_app_directory_path(kind: AppPathKind) -> String {
    get_app_backend().get_app_directory_path(kind)
}

/// The application executable path, or `""` on web.
pub fn get_app_executable_path() -> String {
    get_app_backend().get_executable_path()
}

/// The host UI locale (for example `"en-US"`), or `""` when unknown.
pub fn get_app_locale() -> String {
    get_app_backend().get_locale()
}

/// The application login-item settings. Returns a default with
/// `open_at_login: false` on web.
pub fn get_app_login_item() -> AppLoginItem {
    get_app_backend().get_login_item()
}

/// The application name, or `""` when unknown.
pub fn get_app_name() -> String {
    get_app_backend().get_name()
}

/// The application bundle/exe directory path, or `""` on web.
pub fn get_app_path() -> String {
    get_app_backend().get_app_path()
}

/// The ranked list of preferred system languages (for example
/// `["en-US", "fr-FR"]`), in preference order; `[]` when unavailable (on web:
/// `navigator.languages`).
pub fn get_app_preferred_system_languages() -> Vec<String> {
    get_app_backend().get_preferred_system_languages()
}

/// The OS-level system locale (for example `"en_US"`), which may differ from the
/// UI locale returned by [`get_app_locale`]; `""` when unavailable.
pub fn get_app_system_locale() -> String {
    get_app_backend().get_system_locale()
}

/// The application version string, or `""` when unknown.
pub fn get_app_version() -> String {
    get_app_backend().get_version()
}

/// `true` when the named command-line switch is present; `false` otherwise.
pub fn has_app_command_line_switch(name: &str) -> bool {
    get_app_command_line_switch(name).is_some()
}

/// Returns `true` when this process currently holds the single-instance lock.
pub fn has_app_single_instance_lock() -> bool {
    get_app_backend().has_single_instance_lock()
}

/// Hides the application (macOS hide-all-windows). Returns `true` when
/// supported. No-op on web.
pub fn hide_app() -> bool {
    get_app_backend().hide_app()
}

/// `true` when the application is hidden (macOS only). Always `false` on web.
pub fn is_app_hidden() -> bool {
    get_app_backend().is_app_hidden()
}

/// Quits the application.
pub fn quit_app() {
    get_app_backend().quit();
}

/// Relaunches the application.
pub fn relaunch_app() {
    get_app_backend().relaunch();
}

/// Releases a previously acquired single-instance lock.
pub fn release_app_single_instance_lock() {
    get_app_backend().release_single_instance_lock();
}

/// Draws attention to the application at the OS level (taskbar flash / dock
/// bounce). Returns a request id for [`cancel_app_attention`], or `-1` when
/// unsupported.
pub fn request_app_attention(critical: bool) -> i32 {
    get_app_backend().request_attention(critical)
}

/// Attempts to acquire the single-instance lock. Returns `true` when this
/// process owns it; `false` when another instance already holds it.
pub fn request_app_single_instance_lock() -> bool {
    get_app_backend().request_single_instance_lock()
}

/// Sets the macOS activation policy, controlling dock presence and Command-Tab
/// visibility. No-op on non-macOS and web.
pub fn set_app_activation_policy(policy: AppActivationPolicy) {
    get_app_backend().set_activation_policy(policy);
}

/// Installs a native host app backend. Pass `None` to fall back to the native
/// default backend on the next call to [`get_app_backend`].
pub fn set_app_backend(backend: Option<Arc<dyn AppBackend>>) {
    let mut guard = BACKEND.lock().expect("app backend mutex poisoned");
    *guard = backend;
}

/// Sets the numeric application badge (taskbar overlay / dock / PWA badge).
/// Returns `false` when unsupported.
pub fn set_app_badge_count(count: u32) -> bool {
    get_app_backend().set_badge_count(count)
}

/// Sets the dock/taskbar badge text. Pass `""` to clear it.
pub fn set_app_dock_badge(text: &str) {
    get_app_backend().set_dock_badge(text);
}

/// Sets the macOS dock menu (shown when right-clicking the dock icon). No-op
/// where there is no dock.
pub fn set_app_dock_menu(items: &[MenuItemTemplate]) {
    get_app_backend().set_dock_menu(items);
}

/// Updates login-item (launch-at-startup) settings. Returns `false` when
/// unsupported (web, some Linux environments). Fields left unset keep their
/// current values.
pub fn set_app_login_item(settings: &AppLoginItemLike) -> bool {
    get_app_backend().set_login_item(settings)
}

/// Sets the application name. Returns `false` when unsupported (web). On
/// macOS/Windows this updates the display name shown in the dock/taskbar.
pub fn set_app_name(name: &str) -> bool {
    get_app_backend().set_name(name)
}

/// Sets the Windows AppUserModelID used for taskbar grouping, badging, and Jump
/// Lists. Returns `false` when unsupported. Should be set at startup before
/// creating any windows.
pub fn set_app_user_model_id(id: &str) -> bool {
    get_app_backend().set_user_model_id(id)
}

/// Shows the application after [`hide_app`] (macOS). Returns `true` when
/// supported. No-op on web.
pub fn show_app() -> bool {
    get_app_backend().show_app()
}

// ---------------------------------------------------------------------------
// Native default backend
// ---------------------------------------------------------------------------

/// Default backend serving application identity, lifecycle control, and a
/// file-based single-instance lock from `std` alone. Capabilities that require a
/// windowing host (dock badge/menu/bounce, foreground focus, host-driven app
/// events) return clean sentinels until a native host backend replaces it via
/// [`set_app_backend`].
pub struct NativeAppBackend {
    /// Holds the single-instance lock file path and its handle while the lock is
    /// owned by this process. `None` means the lock is not currently held.
    lock: Mutex<Option<SingleInstanceLock>>,
}

impl NativeAppBackend {
    /// Creates a native app backend that does not yet hold the single-instance
    /// lock. Call [`request_app_single_instance_lock`] to acquire it.
    pub fn new() -> Self {
        Self {
            lock: Mutex::new(None),
        }
    }
}

impl Default for NativeAppBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl AppBackend for NativeAppBackend {
    fn get_name(&self) -> String {
        // The running executable's file stem is the closest std-only stand-in for
        // an application name; `""` when it cannot be determined.
        std::env::current_exe()
            .ok()
            .and_then(|path| {
                path.file_stem()
                    .map(|stem| stem.to_string_lossy().into_owned())
            })
            .unwrap_or_default()
    }

    fn get_version(&self) -> String {
        // std exposes no version for an arbitrary executable; sentinel until a
        // host supplies one.
        String::new()
    }

    fn get_locale(&self) -> String {
        // POSIX locale environment, normalized to the bare locale id (drop any
        // ".UTF-8" / "@modifier" suffix). `""` when unset.
        for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
            if let Ok(value) = std::env::var(key) {
                let trimmed = value.split(['.', '@']).next().unwrap_or("");
                if !trimmed.is_empty() && trimmed != "C" && trimmed != "POSIX" {
                    return trimmed.replace('_', "-");
                }
            }
        }
        String::new()
    }

    fn quit(&self) {
        std::process::exit(0);
    }

    fn relaunch(&self) {
        // Best effort: spawn a fresh copy of this executable with the same
        // arguments, then exit. If the spawn fails there is nothing std can do,
        // so return without exiting (sentinel no-op).
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        let args: Vec<String> = std::env::args().skip(1).collect();
        if std::process::Command::new(exe).args(args).spawn().is_ok() {
            std::process::exit(0);
        }
    }

    fn focus(&self) {
        // No window to raise without a host; no-op.
    }

    fn request_single_instance_lock(&self) -> bool {
        let mut guard = self.lock.lock().expect("app lock mutex poisoned");
        if guard.is_some() {
            // Already held by this process.
            return true;
        }
        match SingleInstanceLock::acquire(&single_instance_lock_path(&self.get_name())) {
            Some(lock) => {
                *guard = Some(lock);
                true
            }
            None => false,
        }
    }

    fn release_single_instance_lock(&self) {
        let mut guard = self.lock.lock().expect("app lock mutex poisoned");
        // Dropping the held lock removes its file.
        *guard = None;
    }

    fn has_single_instance_lock(&self) -> bool {
        self.lock.lock().expect("app lock mutex poisoned").is_some()
    }

    fn set_dock_badge(&self, _text: &str) {
        // No dock without a host; no-op.
    }

    fn set_badge_count(&self, _count: u32) -> bool {
        // No taskbar/dock badge without a host; unsupported.
        false
    }

    fn set_dock_menu(&self, _items: &[MenuItemTemplate]) {
        // No dock menu without a host; no-op.
    }

    fn bounce_dock(&self) -> i32 {
        // No dock without a host; sentinel id.
        -1
    }

    fn cancel_dock_bounce(&self, _id: i32) {
        // No dock without a host; no-op.
    }

    fn add_recent_document(&self, _path: &str) {
        // No recent-documents list without a host; no-op.
    }

    fn clear_recent_documents(&self) {
        // No recent-documents list without a host; no-op.
    }

    fn request_attention(&self, _critical: bool) -> i32 {
        // No taskbar/dock attention without a host; sentinel id.
        -1
    }

    fn cancel_attention(&self, _id: i32) {
        // No attention request without a host; no-op.
    }

    fn get_app_directory_path(&self, _kind: AppPathKind) -> String {
        // No app-identity directory layout without a host; sentinel.
        String::new()
    }

    fn get_app_path(&self) -> String {
        // The directory of the running executable is the closest std-only
        // stand-in for the application path; "" when it cannot be determined.
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|p| p.to_string_lossy().into_owned()))
            .unwrap_or_default()
    }

    fn get_executable_path(&self) -> String {
        std::env::current_exe()
            .ok()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default()
    }

    fn get_command_line(&self) -> Vec<String> {
        std::env::args().collect()
    }

    fn get_preferred_system_languages(&self) -> Vec<String> {
        // Reuse the locale environment as a single-element preference list;
        // [] when unset.
        let locale = self.get_locale();
        if locale.is_empty() {
            Vec::new()
        } else {
            vec![locale]
        }
    }

    fn get_system_locale(&self) -> String {
        self.get_locale()
    }

    fn get_login_item(&self) -> AppLoginItem {
        // No launch-at-startup registration without a host; default item.
        AppLoginItem::default()
    }

    fn set_login_item(&self, _settings: &AppLoginItemLike) -> bool {
        // No launch-at-startup registration without a host; unsupported.
        false
    }

    fn set_name(&self, _name: &str) -> bool {
        // Cannot rename the application without a host; unsupported.
        false
    }

    fn set_user_model_id(&self, _id: &str) -> bool {
        // AppUserModelID is a Windows host concern; unsupported here.
        false
    }

    fn set_activation_policy(&self, _policy: AppActivationPolicy) {
        // No macOS activation policy without a host; no-op.
    }

    fn hide_app(&self) -> bool {
        // No window to hide without a host; unsupported.
        false
    }

    fn show_app(&self) -> bool {
        // No window to show without a host; unsupported.
        false
    }

    fn is_app_hidden(&self) -> bool {
        // No host window state; always visible.
        false
    }

    fn subscribe_activate(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // No event source without a host; the unsubscribe is a no-op.
        Box::new(|| {})
    }

    fn subscribe_all_windows_closed(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_quit_request(
        &self,
        _listener: Box<dyn Fn(Box<dyn Fn() + Send + Sync>) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // No host quit path to intercept; the listener is never called.
        Box::new(|| {})
    }

    fn subscribe_ready(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_open_file(
        &self,
        _listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_second_instance(
        &self,
        _listener: Box<dyn Fn(Vec<String>) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Single-instance lock file
// ---------------------------------------------------------------------------

/// An owned single-instance lock backed by an exclusively-created lock file.
/// Acquired with [`SingleInstanceLock::acquire`]; dropping it removes the file
/// so a subsequent process can acquire it.
struct SingleInstanceLock {
    path: std::path::PathBuf,
}

impl SingleInstanceLock {
    /// Attempts to create the lock file exclusively. Returns the owned lock on
    /// success, or `None` when the file already exists (another instance holds
    /// it) or the directory is not writable.
    fn acquire(path: &std::path::Path) -> Option<Self> {
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
        {
            Ok(_file) => Some(Self {
                path: path.to_path_buf(),
            }),
            Err(_) => None,
        }
    }
}

impl Drop for SingleInstanceLock {
    fn drop(&mut self) {
        // Best effort: removal failure leaves a stale lock but cannot be
        // recovered here.
        let _ = std::fs::remove_file(&self.path);
    }
}

/// The lock file path for `name` inside the system temp directory. A blank or
/// path-bearing name falls back to a fixed token so the path stays a single,
/// predictable file.
fn single_instance_lock_path(name: &str) -> std::path::PathBuf {
    let token: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let token = if token.is_empty() {
        "flighthq-app".to_owned()
    } else {
        token
    };
    std::env::temp_dir().join(format!("{token}.single-instance.lock"))
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn AppBackend>>> = Mutex::new(None);

/// Holds the three unsubscribe closures that keep backend delivery alive for one
/// attached `App`. Call [`AppSubscription::invoke_unsubscribes`] to tear down
/// delivery; merely dropping the struct does not run the closures.
struct AppSubscription {
    app_ptr: usize,
    unsubscribes: Vec<Box<dyn Fn() + Send + Sync>>,
}

impl AppSubscription {
    fn invoke_unsubscribes(&self) {
        for unsubscribe in &self.unsubscribes {
            unsubscribe();
        }
    }
}

// SAFETY: the closures are `Send + Sync`; the raw pointer is used only as a map
// key and is never dereferenced.
unsafe impl Send for AppSubscription {}
unsafe impl Sync for AppSubscription {}

static SUBSCRIPTIONS: Mutex<Vec<AppSubscription>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU64, Ordering};

    use flighthq_signals::{cancel_signal, connect_signal};
    use serial_test::serial;

    use super::*;

    // A fully controllable fake backend mirroring app.test.ts's fakeBackend.
    // Interior mutability lets `&self` methods record calls and fire events.
    // The listener slots are shared `Arc<Mutex<..>>` so each returned unsubscribe
    // can clear its own slot, exactly like the TS fake's `() => activate = null`.
    #[derive(Default)]
    struct FakeState {
        badge: String,
        badge_count: i64,
        dock_menu_items: i64,
        bounce_id: i32,
        cancelled_bounce: i32,
        cancelled_attention: i32,
        focused: bool,
        lock: bool,
        quit_calls: u32,
        relaunch_calls: u32,
        name: String,
        user_model_id: String,
        activation_policy: String,
        hidden: bool,
        last_recent_document: String,
        recent_documents_cleared: bool,
        command_line: Vec<String>,
        login_item: AppLoginItem,
    }

    type ActivateSlot = Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>;
    type OpenFileSlot = Arc<Mutex<Option<Box<dyn Fn(String) + Send + Sync>>>>;
    type SecondSlot = Arc<Mutex<Option<Box<dyn Fn(Vec<String>) + Send + Sync>>>>;
    type QuitRequestSlot =
        Arc<Mutex<Option<Box<dyn Fn(Box<dyn Fn() + Send + Sync>) + Send + Sync>>>>;

    struct FakeBackend {
        state: Mutex<FakeState>,
        activate: ActivateSlot,
        all_windows_closed: ActivateSlot,
        open_file: OpenFileSlot,
        quit_request: QuitRequestSlot,
        ready: ActivateSlot,
        second: SecondSlot,
    }

    impl FakeBackend {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                state: Mutex::new(FakeState {
                    badge_count: -1,
                    dock_menu_items: -1,
                    bounce_id: -1,
                    cancelled_bounce: -1,
                    cancelled_attention: -1,
                    name: "TestApp".to_owned(),
                    ..FakeState::default()
                }),
                activate: Arc::new(Mutex::new(None)),
                all_windows_closed: Arc::new(Mutex::new(None)),
                open_file: Arc::new(Mutex::new(None)),
                quit_request: Arc::new(Mutex::new(None)),
                ready: Arc::new(Mutex::new(None)),
                second: Arc::new(Mutex::new(None)),
            })
        }

        fn fire_activate(&self) {
            if let Some(l) = self.activate.lock().unwrap().as_ref() {
                l();
            }
        }

        fn fire_open_file(&self, path: &str) {
            if let Some(l) = self.open_file.lock().unwrap().as_ref() {
                l(path.to_owned());
            }
        }

        fn fire_second_instance(&self, argv: Vec<String>) {
            if let Some(l) = self.second.lock().unwrap().as_ref() {
                l(argv);
            }
        }

        fn fire_all_windows_closed(&self) {
            if let Some(l) = self.all_windows_closed.lock().unwrap().as_ref() {
                l();
            }
        }

        fn fire_ready(&self) {
            if let Some(l) = self.ready.lock().unwrap().as_ref() {
                l();
            }
        }

        // Fires the quit-request listener with `cancel_host`. When `None`, a
        // no-op host cancel callback is supplied (mirroring the TS fake default).
        fn fire_quit_request(&self, cancel_host: Option<Box<dyn Fn() + Send + Sync>>) {
            let listener = self.quit_request.lock().unwrap();
            if let Some(l) = listener.as_ref() {
                l(cancel_host.unwrap_or_else(|| Box::new(|| {})));
            }
        }
    }

    impl AppBackend for FakeBackend {
        fn get_name(&self) -> String {
            self.state.lock().unwrap().name.clone()
        }
        fn get_version(&self) -> String {
            "1.2.3".to_owned()
        }
        fn get_locale(&self) -> String {
            "en-US".to_owned()
        }
        fn quit(&self) {
            self.state.lock().unwrap().quit_calls += 1;
        }
        fn relaunch(&self) {
            self.state.lock().unwrap().relaunch_calls += 1;
        }
        fn focus(&self) {
            self.state.lock().unwrap().focused = true;
        }
        fn request_single_instance_lock(&self) -> bool {
            self.state.lock().unwrap().lock = true;
            true
        }
        fn release_single_instance_lock(&self) {
            self.state.lock().unwrap().lock = false;
        }
        fn has_single_instance_lock(&self) -> bool {
            self.state.lock().unwrap().lock
        }
        fn set_dock_badge(&self, text: &str) {
            self.state.lock().unwrap().badge = text.to_owned();
        }
        fn set_badge_count(&self, count: u32) -> bool {
            self.state.lock().unwrap().badge_count = count as i64;
            true
        }
        fn set_dock_menu(&self, items: &[MenuItemTemplate]) {
            self.state.lock().unwrap().dock_menu_items = items.len() as i64;
        }
        fn bounce_dock(&self) -> i32 {
            self.state.lock().unwrap().bounce_id = 7;
            7
        }
        fn cancel_dock_bounce(&self, id: i32) {
            self.state.lock().unwrap().cancelled_bounce = id;
        }
        fn add_recent_document(&self, path: &str) {
            self.state.lock().unwrap().last_recent_document = path.to_owned();
        }
        fn clear_recent_documents(&self) {
            self.state.lock().unwrap().recent_documents_cleared = true;
        }
        fn request_attention(&self, _critical: bool) -> i32 {
            42
        }
        fn cancel_attention(&self, id: i32) {
            self.state.lock().unwrap().cancelled_attention = id;
        }
        fn get_app_directory_path(&self, _kind: AppPathKind) -> String {
            "/test/app/userData".to_owned()
        }
        fn get_app_path(&self) -> String {
            "/test/app".to_owned()
        }
        fn get_executable_path(&self) -> String {
            "/test/app/bin".to_owned()
        }
        fn get_command_line(&self) -> Vec<String> {
            self.state.lock().unwrap().command_line.clone()
        }
        fn get_preferred_system_languages(&self) -> Vec<String> {
            vec!["en-US".to_owned(), "fr-FR".to_owned()]
        }
        fn get_system_locale(&self) -> String {
            "en_US".to_owned()
        }
        fn get_login_item(&self) -> AppLoginItem {
            self.state.lock().unwrap().login_item.clone()
        }
        fn set_login_item(&self, settings: &AppLoginItemLike) -> bool {
            let mut state = self.state.lock().unwrap();
            if let Some(v) = settings.open_at_login {
                state.login_item.open_at_login = v;
            }
            if let Some(v) = settings.open_as_hidden {
                state.login_item.open_as_hidden = v;
            }
            if let Some(v) = &settings.args {
                state.login_item.args = v.clone();
            }
            if let Some(v) = &settings.path {
                state.login_item.path = v.clone();
            }
            true
        }
        fn set_name(&self, name: &str) -> bool {
            self.state.lock().unwrap().name = name.to_owned();
            true
        }
        fn set_user_model_id(&self, id: &str) -> bool {
            self.state.lock().unwrap().user_model_id = id.to_owned();
            true
        }
        fn set_activation_policy(&self, policy: AppActivationPolicy) {
            self.state.lock().unwrap().activation_policy = policy.as_str().to_owned();
        }
        fn hide_app(&self) -> bool {
            self.state.lock().unwrap().hidden = true;
            true
        }
        fn show_app(&self) -> bool {
            self.state.lock().unwrap().hidden = false;
            true
        }
        fn is_app_hidden(&self) -> bool {
            self.state.lock().unwrap().hidden
        }
        fn subscribe_activate(
            &self,
            listener: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.activate.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.activate);
            Box::new(move || *slot.lock().unwrap() = None)
        }
        fn subscribe_all_windows_closed(
            &self,
            listener: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.all_windows_closed.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.all_windows_closed);
            Box::new(move || *slot.lock().unwrap() = None)
        }
        fn subscribe_quit_request(
            &self,
            listener: Box<dyn Fn(Box<dyn Fn() + Send + Sync>) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.quit_request.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.quit_request);
            Box::new(move || *slot.lock().unwrap() = None)
        }
        fn subscribe_ready(
            &self,
            listener: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.ready.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.ready);
            Box::new(move || *slot.lock().unwrap() = None)
        }
        fn subscribe_open_file(
            &self,
            listener: Box<dyn Fn(String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.open_file.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.open_file);
            Box::new(move || *slot.lock().unwrap() = None)
        }
        fn subscribe_second_instance(
            &self,
            listener: Box<dyn Fn(Vec<String>) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.second.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.second);
            Box::new(move || *slot.lock().unwrap() = None)
        }
    }

    // Serializes access to the global backend slot. Recovers from a poisoned
    // lock so one failing test does not cascade into the rest of the suite.
    fn lock_test() -> std::sync::MutexGuard<'static, ()> {
        BACKEND_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    // Serializes access to the global backend slot so concurrent tests do not
    // observe each other's installed backend.
    fn with_fake<R>(f: impl FnOnce(&Arc<FakeBackend>) -> R) -> R {
        let _g = lock_test();
        let fake = FakeBackend::new();
        set_app_backend(Some(Arc::clone(&fake) as Arc<dyn AppBackend>));
        let result = f(&fake);
        set_app_backend(None);
        result
    }

    fn unique_token(suffix: &str) -> String {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("flighthq_app_test_{}_{n}_{suffix}", std::process::id())
    }

    static BACKEND_TEST_LOCK: Mutex<()> = Mutex::new(());

    // add_app_recent_document
    #[test]
    #[serial]
    fn add_app_recent_document_forwards_path_to_backend() {
        with_fake(|fake| {
            add_app_recent_document("/home/user/file.txt");
            assert_eq!(
                fake.state.lock().unwrap().last_recent_document,
                "/home/user/file.txt"
            );
        });
    }

    // attach_app
    #[test]
    #[serial]
    fn attach_app_wires_all_six_subscriptions() {
        with_fake(|fake| {
            let app = create_app();
            let activations = Arc::new(AtomicU64::new(0));
            let all_closed = Arc::new(AtomicU64::new(0));
            let ready = Arc::new(AtomicU64::new(0));
            let opened = Arc::new(Mutex::new(String::new()));
            let argv = Arc::new(Mutex::new(Vec::<String>::new()));

            let a = Arc::clone(&activations);
            let _s_activate = connect_signal(
                &app.on_activate,
                Arc::new(move |_: &()| {
                    a.fetch_add(1, Ordering::Relaxed);
                }),
                Default::default(),
            );
            let w = Arc::clone(&all_closed);
            let _s_all = connect_signal(
                &app.on_all_windows_closed,
                Arc::new(move |_: &()| {
                    w.fetch_add(1, Ordering::Relaxed);
                }),
                Default::default(),
            );
            let r = Arc::clone(&ready);
            let _s_ready = connect_signal(
                &app.on_ready,
                Arc::new(move |_: &()| {
                    r.fetch_add(1, Ordering::Relaxed);
                }),
                Default::default(),
            );
            let o = Arc::clone(&opened);
            let _s_open = connect_signal(
                &app.on_open_file,
                Arc::new(move |p: &String| {
                    *o.lock().unwrap() = p.clone();
                }),
                Default::default(),
            );
            let v = Arc::clone(&argv);
            let _s_second = connect_signal(
                &app.on_second_instance,
                Arc::new(move |a: &Vec<String>| {
                    *v.lock().unwrap() = a.clone();
                }),
                Default::default(),
            );

            attach_app(&app);
            fake.fire_activate();
            fake.fire_all_windows_closed();
            fake.fire_ready();
            fake.fire_open_file("/tmp/file.txt");
            fake.fire_second_instance(vec!["--flag".to_owned()]);

            assert_eq!(activations.load(Ordering::Relaxed), 1);
            assert_eq!(all_closed.load(Ordering::Relaxed), 1);
            assert_eq!(ready.load(Ordering::Relaxed), 1);
            assert_eq!(*opened.lock().unwrap(), "/tmp/file.txt");
            assert_eq!(*argv.lock().unwrap(), vec!["--flag".to_owned()]);

            detach_app(&app);
        });
    }

    // attach_app
    #[test]
    #[serial]
    fn attach_app_is_idempotent_tearing_down_prior_subscription() {
        with_fake(|fake| {
            let app = create_app();
            let activations = Arc::new(AtomicU64::new(0));
            let a = Arc::clone(&activations);
            let _s = connect_signal(
                &app.on_activate,
                Arc::new(move |_: &()| {
                    a.fetch_add(1, Ordering::Relaxed);
                }),
                Default::default(),
            );
            attach_app(&app);
            attach_app(&app);
            fake.fire_activate();
            assert_eq!(activations.load(Ordering::Relaxed), 1);
            detach_app(&app);
        });
    }

    // attach_app
    #[test]
    #[serial]
    fn attach_app_quits_when_quit_request_not_cancelled() {
        with_fake(|fake| {
            let app = create_app();
            attach_app(&app);
            fake.fire_quit_request(None);
            assert_eq!(fake.state.lock().unwrap().quit_calls, 1);
            detach_app(&app);
        });
    }

    // attach_app
    #[test]
    #[serial]
    fn attach_app_does_not_quit_when_quit_request_cancelled() {
        with_fake(|fake| {
            let app = create_app();
            let quit_sig = app.on_quit_request.clone();
            let _s = connect_signal(
                &app.on_quit_request,
                Arc::new(move |_: &()| cancel_signal(&quit_sig)),
                Default::default(),
            );
            attach_app(&app);
            fake.fire_quit_request(None);
            assert_eq!(fake.state.lock().unwrap().quit_calls, 0);
            detach_app(&app);
        });
    }

    // attach_app
    #[test]
    #[serial]
    fn attach_app_calls_host_cancel_when_quit_request_vetoed() {
        with_fake(|fake| {
            let app = create_app();
            let quit_sig = app.on_quit_request.clone();
            let _s = connect_signal(
                &app.on_quit_request,
                Arc::new(move |_: &()| cancel_signal(&quit_sig)),
                Default::default(),
            );
            attach_app(&app);
            let host_cancelled = Arc::new(AtomicU64::new(0));
            let hc = Arc::clone(&host_cancelled);
            fake.fire_quit_request(Some(Box::new(move || {
                hc.fetch_add(1, Ordering::Relaxed);
            })));
            assert_eq!(host_cancelled.load(Ordering::Relaxed), 1);
            detach_app(&app);
        });
    }

    // bounce_app_dock
    #[test]
    #[serial]
    fn bounce_app_dock_returns_backend_bounce_id() {
        with_fake(|_| assert_eq!(bounce_app_dock(), 7));
    }

    // bounce_app_dock
    #[test]
    #[serial]
    fn bounce_app_dock_returns_sentinel_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert_eq!(bounce_app_dock(), -1);
    }

    // cancel_app_dock_bounce
    #[test]
    #[serial]
    fn cancel_app_dock_bounce_forwards_id_to_backend() {
        with_fake(|fake| {
            cancel_app_dock_bounce(7);
            assert_eq!(fake.state.lock().unwrap().cancelled_bounce, 7);
        });
    }

    // create_app
    #[test]
    #[serial]
    fn create_app_allocates_six_signals() {
        let app = create_app();
        // Connecting to each signal proves the entity exposes all six.
        let _a = connect_signal(&app.on_activate, Arc::new(|_: &()| {}), Default::default());
        let _w = connect_signal(
            &app.on_all_windows_closed,
            Arc::new(|_: &()| {}),
            Default::default(),
        );
        let _o = connect_signal(
            &app.on_open_file,
            Arc::new(|_: &String| {}),
            Default::default(),
        );
        let _q = connect_signal(
            &app.on_quit_request,
            Arc::new(|_: &()| {}),
            Default::default(),
        );
        let _r = connect_signal(&app.on_ready, Arc::new(|_: &()| {}), Default::default());
        let _s = connect_signal(
            &app.on_second_instance,
            Arc::new(|_: &Vec<String>| {}),
            Default::default(),
        );
    }

    // detach_app
    #[test]
    #[serial]
    fn detach_app_stops_further_delivery() {
        with_fake(|fake| {
            let app = create_app();
            let activations = Arc::new(AtomicU64::new(0));
            let a = Arc::clone(&activations);
            let _s = connect_signal(
                &app.on_activate,
                Arc::new(move |_: &()| {
                    a.fetch_add(1, Ordering::Relaxed);
                }),
                Default::default(),
            );
            attach_app(&app);
            detach_app(&app);
            fake.fire_activate();
            assert_eq!(activations.load(Ordering::Relaxed), 0);
        });
    }

    // dispose_app
    #[test]
    #[serial]
    fn dispose_app_detaches_the_subscription() {
        with_fake(|_| {
            let app = create_app();
            attach_app(&app);
            dispose_app(&app);
            // A second dispose on a detached app is safe.
            dispose_app(&app);
        });
    }

    // focus_app
    #[test]
    #[serial]
    fn focus_app_focuses_through_backend() {
        with_fake(|fake| {
            focus_app();
            assert!(fake.state.lock().unwrap().focused);
        });
    }

    // get_app_backend
    #[test]
    #[serial]
    fn get_app_backend_falls_back_to_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        // get_locale returns a String without panicking on the native default.
        let _ = get_app_backend().get_locale();
    }

    // get_app_locale
    #[test]
    #[serial]
    fn get_app_locale_reads_backend_locale() {
        with_fake(|_| assert_eq!(get_app_locale(), "en-US"));
    }

    // get_app_locale
    #[test]
    #[serial]
    fn get_app_locale_returns_string_from_native_default() {
        let backend = NativeAppBackend::new();
        // Native locale parsing never panics and yields a plain String.
        let _: String = backend.get_locale();
    }

    // get_app_name
    #[test]
    #[serial]
    fn get_app_name_reads_backend_name() {
        with_fake(|_| assert_eq!(get_app_name(), "TestApp"));
    }

    // get_app_name
    #[test]
    #[serial]
    fn get_app_name_returns_exe_stem_from_native_default() {
        let backend = NativeAppBackend::new();
        // The test runner has a current_exe, so the stem is non-empty.
        assert!(!backend.get_name().is_empty());
    }

    // get_app_version
    #[test]
    #[serial]
    fn get_app_version_reads_backend_version() {
        with_fake(|_| assert_eq!(get_app_version(), "1.2.3"));
    }

    // get_app_version
    #[test]
    #[serial]
    fn get_app_version_returns_sentinel_from_native_default() {
        let backend = NativeAppBackend::new();
        assert_eq!(backend.get_version(), "");
    }

    // has_app_single_instance_lock
    #[test]
    #[serial]
    fn has_app_single_instance_lock_reflects_backend_state() {
        with_fake(|_| {
            assert!(!has_app_single_instance_lock());
            request_app_single_instance_lock();
            assert!(has_app_single_instance_lock());
        });
    }

    // quit_app
    #[test]
    #[serial]
    fn quit_app_delegates_to_backend() {
        with_fake(|fake| {
            quit_app();
            assert_eq!(fake.state.lock().unwrap().quit_calls, 1);
        });
    }

    // relaunch_app
    #[test]
    #[serial]
    fn relaunch_app_delegates_to_backend() {
        with_fake(|fake| {
            relaunch_app();
            assert_eq!(fake.state.lock().unwrap().relaunch_calls, 1);
        });
    }

    // release_app_single_instance_lock
    #[test]
    #[serial]
    fn release_app_single_instance_lock_releases_the_lock() {
        with_fake(|fake| {
            request_app_single_instance_lock();
            release_app_single_instance_lock();
            assert!(!fake.state.lock().unwrap().lock);
        });
    }

    // request_app_single_instance_lock
    #[test]
    #[serial]
    fn request_app_single_instance_lock_acquires_the_lock() {
        with_fake(|_| assert!(request_app_single_instance_lock()));
    }

    // set_app_backend
    #[test]
    #[serial]
    fn set_app_backend_clears_back_to_native_fallback_when_none() {
        let _g = lock_test();
        set_app_backend(Some(FakeBackend::new() as Arc<dyn AppBackend>));
        set_app_backend(None);
        // The native default takes over and answers without panicking.
        assert_eq!(get_app_backend().get_version(), "");
    }

    // set_app_badge_count
    #[test]
    #[serial]
    fn set_app_badge_count_forwards_count_to_backend() {
        with_fake(|fake| {
            assert!(set_app_badge_count(5));
            assert_eq!(fake.state.lock().unwrap().badge_count, 5);
        });
    }

    // set_app_badge_count
    #[test]
    #[serial]
    fn set_app_badge_count_returns_false_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert!(!set_app_badge_count(2));
    }

    // set_app_dock_badge
    #[test]
    #[serial]
    fn set_app_dock_badge_forwards_text_to_backend() {
        with_fake(|fake| {
            set_app_dock_badge("3");
            assert_eq!(fake.state.lock().unwrap().badge, "3");
        });
    }

    // set_app_dock_menu
    #[test]
    #[serial]
    fn set_app_dock_menu_forwards_items_to_backend() {
        with_fake(|fake| {
            let items = vec![MenuItemTemplate {
                id: Some("new".to_owned()),
                label: Some("New".to_owned()),
                ..MenuItemTemplate::default()
            }];
            set_app_dock_menu(&items);
            assert_eq!(fake.state.lock().unwrap().dock_menu_items, 1);
        });
    }

    // NativeAppBackend
    #[test]
    #[serial]
    fn native_app_backend_single_instance_lock_is_exclusive_per_file() {
        let path = std::env::temp_dir().join(unique_token("exclusive.lock"));
        let _ = std::fs::remove_file(&path);

        let first = SingleInstanceLock::acquire(&path);
        assert!(first.is_some());
        // A second acquire of the same path fails while the first is held.
        assert!(SingleInstanceLock::acquire(&path).is_none());

        // Dropping the first releases the file so a later acquire succeeds.
        drop(first);
        let second = SingleInstanceLock::acquire(&path);
        assert!(second.is_some());
        drop(second);
        let _ = std::fs::remove_file(&path);
    }

    // NativeAppBackend
    #[test]
    #[serial]
    fn native_app_backend_request_then_release_round_trips_lock() {
        let backend = NativeAppBackend::new();
        assert!(!backend.has_single_instance_lock());
        // Acquire, observe ownership, release, observe non-ownership.
        if backend.request_single_instance_lock() {
            assert!(backend.has_single_instance_lock());
            // A re-request while held stays true and idempotent.
            assert!(backend.request_single_instance_lock());
            backend.release_single_instance_lock();
            assert!(!backend.has_single_instance_lock());
        }
    }

    // NativeAppBackend
    #[test]
    #[serial]
    fn native_app_backend_returns_clean_sentinels_for_host_only_capabilities() {
        let backend = NativeAppBackend::new();
        assert!(!backend.set_badge_count(3));
        assert_eq!(backend.bounce_dock(), -1);
        // No-op host-only commands do not panic.
        backend.set_dock_badge("x");
        backend.set_dock_menu(&[]);
        backend.cancel_dock_bounce(1);
        backend.focus();
        // Subscriptions return a callable no-op unsubscribe.
        (backend.subscribe_activate(Box::new(|| {})))();
        (backend.subscribe_open_file(Box::new(|_| {})))();
        (backend.subscribe_second_instance(Box::new(|_| {})))();
    }

    // single_instance_lock_path
    #[test]
    #[serial]
    fn single_instance_lock_path_sanitizes_and_falls_back() {
        let temp = std::env::temp_dir();
        let named = single_instance_lock_path("My App/v1");
        // Slashes and spaces are stripped so the path stays a single temp file.
        assert_eq!(named.parent(), Some(temp.as_path()));
        assert_eq!(
            named.file_name().unwrap().to_string_lossy(),
            "MyAppv1.single-instance.lock"
        );

        let blank = single_instance_lock_path("");
        assert_eq!(
            blank.file_name().unwrap().to_string_lossy(),
            "flighthq-app.single-instance.lock"
        );
    }

    // cancel_app_attention
    #[test]
    #[serial]
    fn cancel_app_attention_forwards_id_to_backend() {
        with_fake(|fake| {
            cancel_app_attention(42);
            assert_eq!(fake.state.lock().unwrap().cancelled_attention, 42);
        });
    }

    // clear_app_recent_documents
    #[test]
    #[serial]
    fn clear_app_recent_documents_clears_via_backend() {
        with_fake(|fake| {
            clear_app_recent_documents();
            assert!(fake.state.lock().unwrap().recent_documents_cleared);
        });
    }

    // create_app_login_item
    #[test]
    #[serial]
    fn create_app_login_item_returns_default_item() {
        let item = create_app_login_item();
        assert!(!item.open_at_login);
        assert!(!item.open_as_hidden);
        assert!(item.args.is_empty());
        assert_eq!(item.path, "");
    }

    // detach_app
    #[test]
    #[serial]
    fn detach_app_is_safe_when_not_attached() {
        let _g = lock_test();
        set_app_backend(None);
        let app = create_app();
        detach_app(&app);
    }

    // get_app_command_line
    #[test]
    #[serial]
    fn get_app_command_line_returns_backend_arguments() {
        with_fake(|fake| {
            fake.state.lock().unwrap().command_line =
                vec!["--flag".to_owned(), "--key=val".to_owned()];
            assert_eq!(
                get_app_command_line(),
                vec!["--flag".to_owned(), "--key=val".to_owned()]
            );
        });
    }

    // get_app_command_line_switch
    #[test]
    #[serial]
    fn get_app_command_line_switch_returns_empty_for_bare_flag() {
        with_fake(|fake| {
            fake.state.lock().unwrap().command_line = vec!["--debug".to_owned()];
            assert_eq!(get_app_command_line_switch("debug"), Some(String::new()));
        });
    }

    // get_app_command_line_switch
    #[test]
    #[serial]
    fn get_app_command_line_switch_returns_value_for_key_value() {
        with_fake(|fake| {
            fake.state.lock().unwrap().command_line = vec!["--port=3000".to_owned()];
            assert_eq!(get_app_command_line_switch("port"), Some("3000".to_owned()));
        });
    }

    // get_app_command_line_switch
    #[test]
    #[serial]
    fn get_app_command_line_switch_returns_none_when_absent() {
        with_fake(|_| assert_eq!(get_app_command_line_switch("missing"), None));
    }

    // get_app_directory_path
    #[test]
    #[serial]
    fn get_app_directory_path_returns_backend_path() {
        with_fake(|_| {
            assert_eq!(
                get_app_directory_path(AppPathKind::UserData),
                "/test/app/userData"
            );
        });
    }

    // get_app_executable_path
    #[test]
    #[serial]
    fn get_app_executable_path_returns_backend_path() {
        with_fake(|_| assert_eq!(get_app_executable_path(), "/test/app/bin"));
    }

    // get_app_login_item
    #[test]
    #[serial]
    fn get_app_login_item_returns_backend_item() {
        with_fake(|fake| {
            fake.state.lock().unwrap().login_item = AppLoginItem {
                open_at_login: true,
                open_as_hidden: true,
                args: vec!["--hidden".to_owned()],
                path: "/app".to_owned(),
            };
            let item = get_app_login_item();
            assert!(item.open_at_login);
            assert!(item.open_as_hidden);
        });
    }

    // get_app_path
    #[test]
    #[serial]
    fn get_app_path_returns_backend_path() {
        with_fake(|_| assert_eq!(get_app_path(), "/test/app"));
    }

    // get_app_preferred_system_languages
    #[test]
    #[serial]
    fn get_app_preferred_system_languages_returns_backend_list() {
        with_fake(|_| {
            assert_eq!(
                get_app_preferred_system_languages(),
                vec!["en-US".to_owned(), "fr-FR".to_owned()]
            );
        });
    }

    // get_app_system_locale
    #[test]
    #[serial]
    fn get_app_system_locale_returns_backend_locale() {
        with_fake(|_| assert_eq!(get_app_system_locale(), "en_US"));
    }

    // has_app_command_line_switch
    #[test]
    #[serial]
    fn has_app_command_line_switch_reflects_presence() {
        with_fake(|fake| {
            fake.state.lock().unwrap().command_line = vec!["--debug".to_owned()];
            assert!(has_app_command_line_switch("debug"));
            assert!(!has_app_command_line_switch("missing"));
        });
    }

    // hide_app
    #[test]
    #[serial]
    fn hide_app_hides_and_returns_true() {
        with_fake(|fake| {
            assert!(hide_app());
            assert!(fake.state.lock().unwrap().hidden);
        });
    }

    // hide_app
    #[test]
    #[serial]
    fn hide_app_returns_false_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert!(!hide_app());
    }

    // is_app_hidden
    #[test]
    #[serial]
    fn is_app_hidden_reflects_backend_state() {
        with_fake(|_| {
            assert!(!is_app_hidden());
            hide_app();
            assert!(is_app_hidden());
        });
    }

    // request_app_attention
    #[test]
    #[serial]
    fn request_app_attention_returns_backend_id() {
        with_fake(|_| assert_eq!(request_app_attention(true), 42));
    }

    // request_app_attention
    #[test]
    #[serial]
    fn request_app_attention_returns_sentinel_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert_eq!(request_app_attention(true), -1);
    }

    // set_app_activation_policy
    #[test]
    #[serial]
    fn set_app_activation_policy_forwards_policy_to_backend() {
        with_fake(|fake| {
            set_app_activation_policy(AppActivationPolicy::Accessory);
            assert_eq!(fake.state.lock().unwrap().activation_policy, "accessory");
        });
    }

    // set_app_login_item
    #[test]
    #[serial]
    fn set_app_login_item_updates_and_returns_true() {
        with_fake(|fake| {
            let settings = AppLoginItemLike {
                open_at_login: Some(true),
                open_as_hidden: Some(false),
                ..AppLoginItemLike::default()
            };
            assert!(set_app_login_item(&settings));
            assert!(fake.state.lock().unwrap().login_item.open_at_login);
        });
    }

    // set_app_login_item
    #[test]
    #[serial]
    fn set_app_login_item_returns_false_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        let settings = AppLoginItemLike {
            open_at_login: Some(true),
            ..AppLoginItemLike::default()
        };
        assert!(!set_app_login_item(&settings));
    }

    // set_app_name
    #[test]
    #[serial]
    fn set_app_name_updates_and_returns_true() {
        with_fake(|fake| {
            assert!(set_app_name("MyApp"));
            assert_eq!(fake.state.lock().unwrap().name, "MyApp");
        });
    }

    // set_app_name
    #[test]
    #[serial]
    fn set_app_name_returns_false_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert!(!set_app_name("X"));
    }

    // set_app_user_model_id
    #[test]
    #[serial]
    fn set_app_user_model_id_forwards_and_returns_true() {
        with_fake(|fake| {
            assert!(set_app_user_model_id("com.example.app"));
            assert_eq!(fake.state.lock().unwrap().user_model_id, "com.example.app");
        });
    }

    // set_app_user_model_id
    #[test]
    #[serial]
    fn set_app_user_model_id_returns_false_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert!(!set_app_user_model_id("X"));
    }

    // show_app
    #[test]
    #[serial]
    fn show_app_shows_and_returns_true() {
        with_fake(|fake| {
            hide_app();
            assert!(show_app());
            assert!(!fake.state.lock().unwrap().hidden);
        });
    }

    // show_app
    #[test]
    #[serial]
    fn show_app_returns_false_from_native_default() {
        let _g = lock_test();
        set_app_backend(None);
        assert!(!show_app());
    }

    // NativeAppBackend
    #[test]
    #[serial]
    fn native_app_backend_returns_clean_sentinels_for_new_host_only_capabilities() {
        let backend = NativeAppBackend::new();
        assert_eq!(backend.request_attention(true), -1);
        assert_eq!(backend.get_app_directory_path(AppPathKind::Logs), "");
        assert!(!backend.is_app_hidden());
        assert!(!backend.hide_app());
        assert!(!backend.show_app());
        assert!(!backend.set_name("X"));
        assert!(!backend.set_user_model_id("X"));
        assert!(!backend.set_login_item(&AppLoginItemLike::default()));
        assert!(!backend.get_login_item().open_at_login);
        // std-served capabilities return real values, never panic.
        let _ = backend.get_executable_path();
        let _ = backend.get_app_path();
        let _: Vec<String> = backend.get_command_line();
        // No-op host commands do not panic.
        backend.add_recent_document("x");
        backend.clear_recent_documents();
        backend.cancel_attention(1);
        backend.set_activation_policy(AppActivationPolicy::Regular);
    }
}
