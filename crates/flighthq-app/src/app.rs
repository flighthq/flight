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

use flighthq_signals::emit_signal;
use flighthq_types::{App, AppBackend, MenuItemTemplate};

// ---------------------------------------------------------------------------
// App entity lifecycle
// ---------------------------------------------------------------------------

/// Begins delivering app events to `app`'s signals by subscribing to the active
/// backend. Wires `subscribe_activate` → `on_activate`,
/// `subscribe_open_file` → `on_open_file`,
/// `subscribe_second_instance` → `on_second_instance`. Idempotent: a prior
/// subscription is torn down first. Pair with [`detach_app`]/[`dispose_app`].
pub fn attach_app(app: &App) {
    detach_app(app);
    let backend = get_app_backend();

    let sig_activate = app.on_activate.clone();
    let sig_open_file = app.on_open_file.clone();
    let sig_second = app.on_second_instance.clone();

    let unsub_activate = backend.subscribe_activate(Box::new(move || {
        emit_signal(&sig_activate, &());
    }));
    let unsub_open_file = backend.subscribe_open_file(Box::new(move |path: String| {
        emit_signal(&sig_open_file, &path);
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
        unsub_activate,
        unsub_open_file,
        unsub_second,
    });
}

/// Starts a dock bounce; returns a request id usable with
/// [`cancel_app_dock_bounce`], or `-1` when unsupported.
pub fn bounce_app_dock() -> i32 {
    get_app_backend().bounce_dock()
}

/// Cancels a dock bounce previously started by [`bounce_app_dock`].
pub fn cancel_app_dock_bounce(id: i32) {
    get_app_backend().cancel_dock_bounce(id);
}

/// Allocates an [`App`] event entity with inert signals. Call [`attach_app`] to
/// start delivery.
pub fn create_app() -> App {
    App::default()
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

/// The host UI locale (for example `"en-US"`), or `""` when unknown.
pub fn get_app_locale() -> String {
    get_app_backend().get_locale()
}

/// The application name, or `""` when unknown.
pub fn get_app_name() -> String {
    get_app_backend().get_name()
}

/// The application version string, or `""` when unknown.
pub fn get_app_version() -> String {
    get_app_backend().get_version()
}

/// Returns `true` when this process currently holds the single-instance lock.
pub fn has_app_single_instance_lock() -> bool {
    get_app_backend().has_single_instance_lock()
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

/// Attempts to acquire the single-instance lock. Returns `true` when this
/// process owns it; `false` when another instance already holds it.
pub fn request_app_single_instance_lock() -> bool {
    get_app_backend().request_single_instance_lock()
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

    fn subscribe_activate(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // No event source without a host; the unsubscribe is a no-op.
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
    unsub_activate: Box<dyn Fn() + Send + Sync>,
    unsub_open_file: Box<dyn Fn() + Send + Sync>,
    unsub_second: Box<dyn Fn() + Send + Sync>,
}

impl AppSubscription {
    fn invoke_unsubscribes(&self) {
        (self.unsub_activate)();
        (self.unsub_open_file)();
        (self.unsub_second)();
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

    use flighthq_signals::connect_signal;
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
        focused: bool,
        lock: bool,
        quit_calls: u32,
        relaunch_calls: u32,
    }

    type ActivateSlot = Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>;
    type OpenFileSlot = Arc<Mutex<Option<Box<dyn Fn(String) + Send + Sync>>>>;
    type SecondSlot = Arc<Mutex<Option<Box<dyn Fn(Vec<String>) + Send + Sync>>>>;

    struct FakeBackend {
        state: Mutex<FakeState>,
        activate: ActivateSlot,
        open_file: OpenFileSlot,
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
                    ..FakeState::default()
                }),
                activate: Arc::new(Mutex::new(None)),
                open_file: Arc::new(Mutex::new(None)),
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
    }

    impl AppBackend for FakeBackend {
        fn get_name(&self) -> String {
            "TestApp".to_owned()
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
        fn subscribe_activate(
            &self,
            listener: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.activate.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.activate);
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

    // attach_app
    #[test]
    #[serial]
    fn attach_app_wires_activate_open_file_and_second_instance() {
        with_fake(|fake| {
            let app = create_app();
            let activations = Arc::new(AtomicU64::new(0));
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
            fake.fire_open_file("/tmp/file.txt");
            fake.fire_second_instance(vec!["--flag".to_owned()]);

            assert_eq!(activations.load(Ordering::Relaxed), 1);
            assert_eq!(*opened.lock().unwrap(), "/tmp/file.txt");
            assert_eq!(*argv.lock().unwrap(), vec!["--flag".to_owned()]);

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
    fn create_app_allocates_three_signals() {
        let app = create_app();
        // Connecting to each signal proves the entity exposes all three.
        let _a = connect_signal(&app.on_activate, Arc::new(|_: &()| {}), Default::default());
        let _o = connect_signal(
            &app.on_open_file,
            Arc::new(|_: &String| {}),
            Default::default(),
        );
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
}
