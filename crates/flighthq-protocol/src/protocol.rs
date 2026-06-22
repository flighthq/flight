//! Protocol free functions and backend management.

use flighthq_signals::emit_signal;
use flighthq_types::{ProtocolBackend, ProtocolHandler};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active protocol backend. Lazily installs the default sentinel
/// backend when none has been set. There is always a backend.
pub fn get_protocol_backend() -> Arc<dyn ProtocolBackend> {
    let mut guard = BACKEND.lock().expect("protocol backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(DefaultProtocolBackend));
    }
    Arc::clone(guard.as_ref().unwrap())
}

/// Installs a native host protocol backend. Pass `None` to fall back to the
/// default sentinel backend on the next call to [`get_protocol_backend`].
pub fn set_protocol_backend(backend: Option<Arc<dyn ProtocolBackend>>) {
    let mut guard = BACKEND.lock().expect("protocol backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// ProtocolHandler entity lifecycle
// ---------------------------------------------------------------------------

/// Allocates a [`ProtocolHandler`] event entity with an inert signal. Call
/// [`attach_protocol_handler`] to start delivery.
pub fn create_protocol_handler() -> ProtocolHandler {
    ProtocolHandler::default()
}

/// Begins delivering deep-link opens to `handler`'s signal by subscribing to
/// the active backend. Wires `subscribe` → `on_open_url`. Idempotent: a prior
/// subscription is torn down first. Pair with
/// [`detach_protocol_handler`]/[`dispose_protocol_handler`].
pub fn attach_protocol_handler(handler: &ProtocolHandler) {
    detach_protocol_handler(handler);
    let backend = get_protocol_backend();

    let sig = handler.on_open_url.clone();
    let unsub = backend.subscribe(Box::new(move |url: String| {
        emit_signal(&sig, &url);
    }));

    let handler_ptr = handler as *const ProtocolHandler as usize;
    let mut subs = SUBSCRIPTIONS
        .lock()
        .expect("protocol subscriptions mutex poisoned");
    subs.push(ProtocolSubscription { handler_ptr, unsub });
}

/// Stops delivery to `handler` and forgets its subscription. Safe to call
/// when not attached.
pub fn detach_protocol_handler(handler: &ProtocolHandler) {
    let handler_ptr = handler as *const ProtocolHandler as usize;
    let removed: Vec<ProtocolSubscription> = {
        let mut subs = SUBSCRIPTIONS
            .lock()
            .expect("protocol subscriptions mutex poisoned");
        // Partition out this handler's subscriptions. Run their unsubscribe
        // closures after releasing the lock so a backend that re-enters the
        // registry from unsubscribe cannot deadlock.
        let mut keep = Vec::with_capacity(subs.len());
        let mut drop = Vec::new();
        for sub in subs.drain(..) {
            if sub.handler_ptr == handler_ptr {
                drop.push(sub);
            } else {
                keep.push(sub);
            }
        }
        *subs = keep;
        drop
    };
    for sub in removed {
        (sub.unsub)();
    }
}

/// Releases `handler` for garbage collection by detaching its backend
/// subscription. The signal remains plain GC-managed memory afterward.
pub fn dispose_protocol_handler(handler: &ProtocolHandler) {
    detach_protocol_handler(handler);
}

// ---------------------------------------------------------------------------
// Scheme registration
// ---------------------------------------------------------------------------

/// Returns `true` when `scheme` is currently registered to this app. Returns
/// `false` where the host cannot report it.
pub fn is_protocol_scheme_registered(scheme: &str) -> bool {
    get_protocol_backend().is_registered(scheme)
}

/// Registers a custom URI scheme (for example `"myapp"`) to this app. Returns
/// `false` when the host denies or does not support registration.
pub fn register_protocol_scheme(scheme: &str) -> bool {
    get_protocol_backend().register(scheme)
}

/// Makes this app the default handler for `scheme`. Returns `false` when the
/// host denies or does not support it.
pub fn set_protocol_scheme_as_default(scheme: &str) -> bool {
    get_protocol_backend().set_as_default(scheme)
}

/// Unregisters a previously registered custom URI scheme. Returns `false`
/// when the host denies or does not support unregistration.
pub fn unregister_protocol_scheme(scheme: &str) -> bool {
    get_protocol_backend().unregister(scheme)
}

// ---------------------------------------------------------------------------
// Default sentinel backend
// ---------------------------------------------------------------------------

/// The always-available default backend. Custom URI-scheme registration and
/// deep-link delivery require an OS host, so every command reports failure
/// (`false`) and `subscribe` is inert with a no-op unsubscribe. A native host
/// replaces this via [`set_protocol_backend`].
struct DefaultProtocolBackend;

impl ProtocolBackend for DefaultProtocolBackend {
    fn register(&self, _scheme: &str) -> bool {
        // No OS host to claim the scheme; report failure rather than panic.
        false
    }
    fn unregister(&self, _scheme: &str) -> bool {
        // Nothing was registered here; report failure.
        false
    }
    fn is_registered(&self, _scheme: &str) -> bool {
        // No registration query without a host; report not-registered.
        false
    }
    fn set_as_default(&self, _scheme: &str) -> bool {
        // Cannot claim a scheme as the OS default without a host.
        false
    }
    fn subscribe(
        &self,
        _listener: Box<dyn Fn(String) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // Deep-link delivery requires a native host to route incoming URLs; the
        // default backend cannot observe protocol opens, so this is inert.
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn ProtocolBackend>>> = Mutex::new(None);

/// Holds the unsubscribe closure that keeps backend delivery alive for one
/// attached [`ProtocolHandler`]. Dropping this struct tears it down.
struct ProtocolSubscription {
    handler_ptr: usize,
    unsub: Box<dyn Fn() + Send + Sync>,
}

// SAFETY: the closure is `Send + Sync`; the raw pointer is used only as a
// map key and is never dereferenced.
unsafe impl Send for ProtocolSubscription {}
unsafe impl Sync for ProtocolSubscription {}

static SUBSCRIPTIONS: Mutex<Vec<ProtocolSubscription>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use serial_test::serial;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    // A stub host backend that records register/default state and lets a test
    // fire a deep-link URL into the most recently captured subscriber.
    struct StubBackend {
        registered: Arc<AtomicBool>,
        defaulted: Arc<AtomicBool>,
        listener: Arc<Mutex<Option<Arc<dyn Fn(String) + Send + Sync>>>>,
    }

    impl StubBackend {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                registered: Arc::new(AtomicBool::new(false)),
                defaulted: Arc::new(AtomicBool::new(false)),
                listener: Arc::new(Mutex::new(None)),
            })
        }

        fn fire(&self, url: &str) {
            let captured = self.listener.lock().unwrap().clone();
            if let Some(listener) = captured {
                listener(url.to_string());
            }
        }
    }

    impl ProtocolBackend for StubBackend {
        fn register(&self, _scheme: &str) -> bool {
            self.registered.store(true, Ordering::SeqCst);
            true
        }
        fn unregister(&self, _scheme: &str) -> bool {
            self.registered.store(false, Ordering::SeqCst);
            true
        }
        fn is_registered(&self, _scheme: &str) -> bool {
            self.registered.load(Ordering::SeqCst)
        }
        fn set_as_default(&self, _scheme: &str) -> bool {
            self.defaulted.store(true, Ordering::SeqCst);
            true
        }
        fn subscribe(
            &self,
            listener: Box<dyn Fn(String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            let stored: Arc<dyn Fn(String) + Send + Sync> = Arc::from(listener);
            *self.listener.lock().unwrap() = Some(stored);
            // Unsubscribe clears the stored listener, mirroring a host backend
            // tearing down delivery so detach actually stops it.
            let slot = self.listener.clone();
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
    }

    // The backend registry is a process-global singleton, so tests that install
    // or clear it must not interleave. `serial` locks this for the test body and
    // clears the backend to a known state; the returned guard must stay bound.
    static TEST_GUARD: Mutex<()> = Mutex::new(());

    #[must_use]
    fn serial() -> std::sync::MutexGuard<'static, ()> {
        let guard = TEST_GUARD.lock().unwrap_or_else(|e| e.into_inner());
        set_protocol_backend(None);
        guard
    }

    fn clear_backend() {
        set_protocol_backend(None);
    }

    #[test]
    #[serial]
    fn attach_protocol_handler_emits_on_open_url() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));

        let handler = create_protocol_handler();
        let opened: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let opened_w = opened.clone();
        let _guard = connect_signal(
            &handler.on_open_url,
            Arc::new(move |url: &String| {
                *opened_w.lock().unwrap() = url.clone();
            }),
            Default::default(),
        );

        attach_protocol_handler(&handler);
        backend.fire("myapp://open/123");

        assert_eq!(*opened.lock().unwrap(), "myapp://open/123");
        detach_protocol_handler(&handler);
        clear_backend();
    }

    #[test]
    #[serial]
    fn create_protocol_handler_returns_default() {
        let _serial = serial();
        let handler = create_protocol_handler();
        // Signal is inert by default — emitting reaches no listeners and does
        // not panic.
        emit_signal(&handler.on_open_url, &"unused".to_string());
    }

    #[test]
    #[serial]
    fn default_protocol_backend_reports_sentinels() {
        // With no host installed, every command fails and delivery is inert.
        let _serial = serial();
        assert!(!register_protocol_scheme("myapp"));
        assert!(!unregister_protocol_scheme("myapp"));
        assert!(!is_protocol_scheme_registered("myapp"));
        assert!(!set_protocol_scheme_as_default("myapp"));

        let unsubscribe = get_protocol_backend().subscribe(Box::new(|_url| {}));
        // The no-op unsubscribe is safe to call.
        unsubscribe();
        clear_backend();
    }

    #[test]
    #[serial]
    fn detach_protocol_handler_stops_delivery() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));

        let handler = create_protocol_handler();
        let count = Arc::new(AtomicUsize::new(0));
        let count_w = count.clone();
        let _guard = connect_signal(
            &handler.on_open_url,
            Arc::new(move |_url: &String| {
                count_w.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_protocol_handler(&handler);
        detach_protocol_handler(&handler);
        backend.fire("myapp://x");

        assert_eq!(count.load(Ordering::SeqCst), 0);
        clear_backend();
    }

    #[test]
    #[serial]
    fn dispose_protocol_handler_detaches() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));

        let handler = create_protocol_handler();
        attach_protocol_handler(&handler);
        dispose_protocol_handler(&handler);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_protocol_backend_falls_back_to_default() {
        let _serial = serial();
        // There is always a backend; the default reports not-registered.
        assert!(!get_protocol_backend().is_registered("myapp"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn is_protocol_scheme_registered_reflects_backend() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        assert!(!is_protocol_scheme_registered("myapp"));
        register_protocol_scheme("myapp");
        assert!(is_protocol_scheme_registered("myapp"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn register_protocol_scheme_returns_true_for_stub() {
        let _serial = serial();
        set_protocol_backend(Some(StubBackend::new()));
        assert!(register_protocol_scheme("myapp"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn set_protocol_backend_clears_to_default() {
        let _serial = serial();
        set_protocol_backend(Some(StubBackend::new()));
        set_protocol_backend(None);
        // Falls back to the default sentinel backend.
        assert!(!get_protocol_backend().is_registered("myapp"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn set_protocol_scheme_as_default_marks_through_backend() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        assert!(set_protocol_scheme_as_default("myapp"));
        assert!(backend.defaulted.load(Ordering::SeqCst));
        clear_backend();
    }

    #[test]
    #[serial]
    fn unregister_protocol_scheme_returns_true_for_stub() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        register_protocol_scheme("myapp");
        assert!(unregister_protocol_scheme("myapp"));
        assert!(!backend.registered.load(Ordering::SeqCst));
        clear_backend();
    }
}
