//! Protocol free functions and backend management.

use flighthq_signals::emit_signal;
use flighthq_types::{ParsedProtocolUrl, ProtocolBackend, ProtocolHandler};
use std::collections::BTreeMap;
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
/// subscription is torn down first. Drains any URLs that arrived before this
/// call (buffered by the backend between process start and first attach) and
/// emits each one before activating the live subscription. Pair with
/// [`detach_protocol_handler`]/[`dispose_protocol_handler`].
pub fn attach_protocol_handler(handler: &ProtocolHandler) {
    detach_protocol_handler(handler);
    let backend = get_protocol_backend();

    // Drain URLs that arrived between process start and first attach.
    for url in backend.drain_pending_urls() {
        emit_signal(&handler.on_open_url, &url);
    }

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

/// Builds a protocol URL string from its parsed components. `scheme`, `host`,
/// `path`, and `query` are all optional; the result is always a valid absolute
/// URI string. Round-trips with [`parse_protocol_url`] for well-formed inputs.
pub fn create_protocol_url(parts: &ParsedProtocolUrl) -> String {
    let scheme = if parts.scheme.is_empty() {
        "unknown"
    } else {
        &parts.scheme
    };
    let authority = if parts.host.is_empty() {
        String::new()
    } else {
        format!("//{}", parts.host)
    };
    let normalized_path = if !parts.path.is_empty() && !parts.path.starts_with('/') {
        format!("/{}", parts.path)
    } else {
        parts.path.clone()
    };
    let mut url = format!("{scheme}:{authority}{normalized_path}");
    let entries: Vec<(&String, &String)> =
        parts.query.iter().filter(|(k, _)| !k.is_empty()).collect();
    if !entries.is_empty() {
        let qs = entries
            .iter()
            .map(|(k, v)| format!("{}={}", percent_encode(k), percent_encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        url.push('?');
        url.push_str(&qs);
    }
    url
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

/// Returns the URL the app was launched with via a deep link (cold start), or
/// `None` when the app was not launched via a link. One-shot idempotent query —
/// re-readable. Distinct from `on_open_url`, which fires only for warm opens.
pub fn get_protocol_launch_url() -> Option<String> {
    get_protocol_backend().get_launch_url()
}

/// Returns all custom URI schemes currently registered by this app. Returns an
/// empty vector when the host cannot enumerate registered schemes.
pub fn get_registered_protocol_schemes() -> Vec<String> {
    get_protocol_backend().get_registered_schemes()
}

/// True when `scheme` is the OS default handler for deep links. Returns `false`
/// where the host cannot report it (e.g. the web platform).
pub fn is_protocol_scheme_default(scheme: &str) -> bool {
    get_protocol_backend().is_default(scheme)
}

/// Returns `true` when `scheme` is currently registered to this app. Returns
/// `false` where the host cannot report it.
pub fn is_protocol_scheme_registered(scheme: &str) -> bool {
    get_protocol_backend().is_registered(scheme)
}

/// Returns `true` when `scheme` is a valid RFC 3986 URI scheme: starts with an
/// ASCII letter followed by zero or more letters, digits, `'+'`, `'-'`, or
/// `'.'`. Reserved schemes (`http`, `https`, `ftp`, `ftps`, `mailto`, `file`)
/// are rejected to prevent OS conflicts. Scheme is lowercased before validation
/// so `"MyApp"` is treated identically to `"myapp"`.
pub fn is_valid_protocol_scheme(scheme: &str) -> bool {
    if scheme.is_empty() {
        return false;
    }
    let lower = scheme.to_ascii_lowercase();
    if is_reserved_scheme(&lower) {
        return false;
    }
    matches_scheme_pattern(&lower)
}

/// Parses a deep-link URL into its components. Returns `None` for malformed or
/// non-custom-scheme URLs. `query` values are percent-decoded; for duplicate
/// keys the last value wins (matches `URLSearchParams` behavior).
pub fn parse_protocol_url(url: &str) -> Option<ParsedProtocolUrl> {
    if url.is_empty() {
        return None;
    }
    let colon_idx = url.find(':')?;
    if colon_idx == 0 {
        return None;
    }
    let scheme = url[..colon_idx].to_ascii_lowercase();
    if !matches_scheme_pattern(&scheme) {
        return None;
    }

    let mut rest = &url[colon_idx + 1..];

    // Authority (//host)
    let mut host = String::new();
    if let Some(after) = rest.strip_prefix("//") {
        rest = after;
        let slash_idx = rest.find('/');
        let q_idx = rest.find('?');
        let host_end = match (slash_idx, q_idx) {
            (Some(s), Some(q)) if s < q => s,
            (Some(s), None) => s,
            (_, Some(q)) => q,
            (None, None) => rest.len(),
        };
        host = rest[..host_end].to_string();
        rest = &rest[host_end..];
    }

    // Path and query
    let (path, query_string) = match rest.find('?') {
        Some(q) => (rest[..q].to_string(), &rest[q + 1..]),
        None => (rest.to_string(), ""),
    };

    // Decode query
    let mut query: BTreeMap<String, String> = BTreeMap::new();
    if !query_string.is_empty() {
        for pair in query_string.split('&') {
            match pair.find('=') {
                None => {
                    let k = safe_decode(pair);
                    if !k.is_empty() {
                        query.insert(k, String::new());
                    }
                }
                Some(eq) => {
                    let k = safe_decode(&pair[..eq]);
                    if !k.is_empty() {
                        query.insert(k, safe_decode(&pair[eq + 1..]));
                    }
                }
            }
        }
    }

    Some(ParsedProtocolUrl {
        scheme,
        host,
        path,
        query,
    })
}

/// Registers a custom URI scheme (for example `"myapp"`) to this app. Returns
/// `false` when the scheme is invalid (RFC 3986 grammar, no reserved schemes)
/// or when the host denies or does not support registration.
pub fn register_protocol_scheme(scheme: &str) -> bool {
    if !is_valid_protocol_scheme(scheme) {
        return false;
    }
    get_protocol_backend().register(scheme)
}

/// Registers multiple custom URI schemes in one call. Returns `false` if any
/// scheme is invalid or if any registration fails.
pub fn register_protocol_schemes(schemes: &[&str]) -> bool {
    let backend = get_protocol_backend();
    let mut all_ok = true;
    for scheme in schemes {
        if !is_valid_protocol_scheme(scheme) || !backend.register(scheme) {
            all_ok = false;
        }
    }
    all_ok
}

/// Removes this app as the OS default handler for `scheme`. Returns `false`
/// when the host denies or does not support it.
pub fn remove_protocol_scheme_as_default(scheme: &str) -> bool {
    get_protocol_backend().remove_as_default(scheme)
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

/// Unregisters multiple custom URI schemes in one call. Returns `false` if any
/// unregistration fails.
pub fn unregister_protocol_schemes(schemes: &[&str]) -> bool {
    let backend = get_protocol_backend();
    let mut all_ok = true;
    for scheme in schemes {
        if !backend.unregister(scheme) {
            all_ok = false;
        }
    }
    all_ok
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
    fn get_registered_schemes(&self) -> Vec<String> {
        // No enumeration without a host; report none.
        Vec::new()
    }
    fn set_as_default(&self, _scheme: &str) -> bool {
        // Cannot claim a scheme as the OS default without a host.
        false
    }
    fn is_default(&self, _scheme: &str) -> bool {
        // Cannot query the OS default handler without a host; report false.
        false
    }
    fn remove_as_default(&self, _scheme: &str) -> bool {
        // Cannot remove an OS default handler without a host; report failure.
        false
    }
    fn get_launch_url(&self) -> Option<String> {
        // No cold-start launch URL without a host.
        None
    }
    fn drain_pending_urls(&self) -> Vec<String> {
        // The default backend has no pre-attach buffering.
        Vec::new()
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

/// Schemes that should never be claimed as custom URI handlers to avoid OS
/// conflicts.
const RESERVED_SCHEMES: [&str; 6] = ["file", "ftp", "ftps", "http", "https", "mailto"];

fn is_reserved_scheme(scheme: &str) -> bool {
    RESERVED_SCHEMES.contains(&scheme)
}

// RFC 3986 scheme grammar on a lowercased input: a letter followed by zero or
// more of letter / digit / '+' / '-' / '.'.
fn matches_scheme_pattern(scheme: &str) -> bool {
    let mut chars = scheme.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '+' | '-' | '.'))
}

// Percent-encodes a query component, mirroring JS `encodeURIComponent`: ASCII
// letters/digits and `-_.!~*'()` pass through; everything else is `%XX` over
// the UTF-8 bytes.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        let unreserved = byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            );
        if unreserved {
            out.push(byte as char);
        } else {
            out.push('%');
            out.push_str(&format!("{byte:02X}"));
        }
    }
    out
}

// Percent-decodes a query component, mirroring `decodeURIComponent` after first
// turning '+' into a space. Falls back to the raw input on malformed escapes.
fn safe_decode(s: &str) -> String {
    let spaced = s.replace('+', " ");
    let bytes = spaced.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return spaced;
            }
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            match (hi, lo) {
                (Some(h), Some(l)) => {
                    out.push((h * 16 + l) as u8);
                    i += 3;
                }
                _ => return spaced,
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or(spaced)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use serial_test::serial;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    // A stub host backend that records register/default state, tracks
    // registered schemes, a launch URL, and a pre-attach pending-URL queue, and
    // lets a test fire a deep-link URL into the most recently captured
    // subscriber.
    struct StubBackend {
        registered: Arc<AtomicBool>,
        defaulted: Arc<AtomicBool>,
        registered_schemes: Arc<Mutex<Vec<String>>>,
        launch_url: Arc<Mutex<Option<String>>>,
        pending_urls: Arc<Mutex<Vec<String>>>,
        listener: Arc<Mutex<Option<Arc<dyn Fn(String) + Send + Sync>>>>,
    }

    impl StubBackend {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                registered: Arc::new(AtomicBool::new(false)),
                defaulted: Arc::new(AtomicBool::new(false)),
                registered_schemes: Arc::new(Mutex::new(Vec::new())),
                launch_url: Arc::new(Mutex::new(None)),
                pending_urls: Arc::new(Mutex::new(Vec::new())),
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
        fn register(&self, scheme: &str) -> bool {
            self.registered.store(true, Ordering::SeqCst);
            let mut schemes = self.registered_schemes.lock().unwrap();
            if !schemes.iter().any(|s| s == scheme) {
                schemes.push(scheme.to_string());
            }
            true
        }
        fn unregister(&self, scheme: &str) -> bool {
            self.registered.store(false, Ordering::SeqCst);
            let mut schemes = self.registered_schemes.lock().unwrap();
            schemes.retain(|s| s != scheme);
            true
        }
        fn is_registered(&self, _scheme: &str) -> bool {
            self.registered.load(Ordering::SeqCst)
        }
        fn get_registered_schemes(&self) -> Vec<String> {
            self.registered_schemes.lock().unwrap().clone()
        }
        fn set_as_default(&self, _scheme: &str) -> bool {
            self.defaulted.store(true, Ordering::SeqCst);
            true
        }
        fn is_default(&self, _scheme: &str) -> bool {
            self.defaulted.load(Ordering::SeqCst)
        }
        fn remove_as_default(&self, _scheme: &str) -> bool {
            self.defaulted.store(false, Ordering::SeqCst);
            true
        }
        fn get_launch_url(&self) -> Option<String> {
            self.launch_url.lock().unwrap().clone()
        }
        fn drain_pending_urls(&self) -> Vec<String> {
            let mut pending = self.pending_urls.lock().unwrap();
            std::mem::take(&mut *pending)
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

    #[test]
    #[serial]
    fn attach_protocol_handler_drains_pending_urls() {
        let _serial = serial();
        let backend = StubBackend::new();
        *backend.pending_urls.lock().unwrap() =
            vec!["myapp://early/1".to_string(), "myapp://early/2".to_string()];
        set_protocol_backend(Some(backend.clone()));

        let handler = create_protocol_handler();
        let received: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let received_w = received.clone();
        let _guard = connect_signal(
            &handler.on_open_url,
            Arc::new(move |url: &String| received_w.lock().unwrap().push(url.clone())),
            Default::default(),
        );

        attach_protocol_handler(&handler);
        assert_eq!(
            *received.lock().unwrap(),
            vec!["myapp://early/1".to_string(), "myapp://early/2".to_string()]
        );
        // Pending queue is cleared — a second attach does not re-deliver them.
        attach_protocol_handler(&handler);
        assert_eq!(
            *received.lock().unwrap(),
            vec!["myapp://early/1".to_string(), "myapp://early/2".to_string()]
        );
        detach_protocol_handler(&handler);
        clear_backend();
    }

    #[test]
    #[serial]
    fn attach_protocol_handler_is_idempotent() {
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
        attach_protocol_handler(&handler);
        backend.fire("myapp://x");
        assert_eq!(count.load(Ordering::SeqCst), 1);
        detach_protocol_handler(&handler);
        clear_backend();
    }

    #[test]
    #[serial]
    fn create_protocol_url_builds_and_round_trips() {
        let _serial = serial();
        // Builds a basic URL from all parts.
        let mut query = BTreeMap::new();
        query.insert("ref".to_string(), "home".to_string());
        let url = create_protocol_url(&ParsedProtocolUrl {
            scheme: "myapp".to_string(),
            host: "open".to_string(),
            path: "/item/1".to_string(),
            query,
        });
        assert_eq!(url, "myapp://open/item/1?ref=home");

        // Omits authority when host is empty.
        let url = create_protocol_url(&ParsedProtocolUrl {
            scheme: "myapp".to_string(),
            host: String::new(),
            path: "/action".to_string(),
            query: BTreeMap::new(),
        });
        assert_eq!(url, "myapp:/action");

        // Omits query when no query params.
        let url = create_protocol_url(&ParsedProtocolUrl {
            scheme: "myapp".to_string(),
            host: "x".to_string(),
            path: String::new(),
            query: BTreeMap::new(),
        });
        assert_eq!(url, "myapp://x");

        // Percent-encodes query keys and values.
        let mut query = BTreeMap::new();
        query.insert("a b".to_string(), "c d".to_string());
        let url = create_protocol_url(&ParsedProtocolUrl {
            scheme: "myapp".to_string(),
            host: String::new(),
            path: String::new(),
            query,
        });
        assert!(url.contains("a%20b=c%20d"));

        // Round-trips with parse_protocol_url.
        let mut query = BTreeMap::new();
        query.insert("k".to_string(), "v".to_string());
        let parts = ParsedProtocolUrl {
            scheme: "myapp".to_string(),
            host: "host".to_string(),
            path: "/path".to_string(),
            query,
        };
        let url = create_protocol_url(&parts);
        let parsed = parse_protocol_url(&url).unwrap();
        assert_eq!(parsed.scheme, "myapp");
        assert_eq!(parsed.host, "host");
        assert_eq!(parsed.path, "/path");
        assert_eq!(parsed.query.get("k").map(String::as_str), Some("v"));
    }

    #[test]
    #[serial]
    fn detach_protocol_handler_is_safe_when_not_attached() {
        let _serial = serial();
        let handler = create_protocol_handler();
        // Does not panic.
        detach_protocol_handler(&handler);
        clear_backend();
    }

    #[test]
    #[serial]
    fn dispose_protocol_handler_stops_delivery() {
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
        dispose_protocol_handler(&handler);
        backend.fire("myapp://x");
        assert_eq!(count.load(Ordering::SeqCst), 0);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_protocol_backend_returns_installed_backend() {
        let _serial = serial();
        // The default reports sentinels through the new methods.
        assert!(!is_protocol_scheme_default("myapp"));
        assert!(!remove_protocol_scheme_as_default("myapp"));
        assert!(get_protocol_launch_url().is_none());
        assert!(get_registered_protocol_schemes().is_empty());
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_protocol_launch_url_reflects_backend() {
        let _serial = serial();
        // Returns None when no launch URL.
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        assert!(get_protocol_launch_url().is_none());

        // Returns the launch URL when present, idempotently.
        *backend.launch_url.lock().unwrap() = Some("myapp://cold-start/item".to_string());
        assert_eq!(
            get_protocol_launch_url(),
            Some("myapp://cold-start/item".to_string())
        );
        assert_eq!(
            get_protocol_launch_url(),
            Some("myapp://cold-start/item".to_string())
        );
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_registered_protocol_schemes_reflects_backend() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        assert!(get_registered_protocol_schemes().is_empty());
        register_protocol_scheme("myapp");
        assert!(get_registered_protocol_schemes().contains(&"myapp".to_string()));
        clear_backend();
    }

    #[test]
    #[serial]
    fn is_protocol_scheme_default_reflects_backend() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        assert!(!is_protocol_scheme_default("myapp"));
        set_protocol_scheme_as_default("myapp");
        assert!(is_protocol_scheme_default("myapp"));
        remove_protocol_scheme_as_default("myapp");
        assert!(!is_protocol_scheme_default("myapp"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn is_valid_protocol_scheme_validates() {
        let _serial = serial();
        // Accepts valid custom schemes.
        assert!(is_valid_protocol_scheme("myapp"));
        assert!(is_valid_protocol_scheme("my-app"));
        assert!(is_valid_protocol_scheme("my.app"));
        assert!(is_valid_protocol_scheme("my+app"));
        assert!(is_valid_protocol_scheme("app123"));
        // Rejects schemes not starting with a letter.
        assert!(!is_valid_protocol_scheme("1app"));
        assert!(!is_valid_protocol_scheme("-app"));
        // Rejects empty input.
        assert!(!is_valid_protocol_scheme(""));
        // Rejects reserved schemes.
        assert!(!is_valid_protocol_scheme("http"));
        assert!(!is_valid_protocol_scheme("https"));
        assert!(!is_valid_protocol_scheme("ftp"));
        assert!(!is_valid_protocol_scheme("mailto"));
        assert!(!is_valid_protocol_scheme("file"));
        // Case-insensitive.
        assert!(is_valid_protocol_scheme("MyApp"));
        assert!(!is_valid_protocol_scheme("HTTP"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn parse_protocol_url_parses_components() {
        let _serial = serial();
        // Full URL with host, path, and query.
        let result = parse_protocol_url("myapp://host/path?foo=bar&baz=qux").unwrap();
        assert_eq!(result.scheme, "myapp");
        assert_eq!(result.host, "host");
        assert_eq!(result.path, "/path");
        assert_eq!(result.query.get("foo").map(String::as_str), Some("bar"));
        assert_eq!(result.query.get("baz").map(String::as_str), Some("qux"));

        // No host.
        let result = parse_protocol_url("myapp:/action").unwrap();
        assert_eq!(result.scheme, "myapp");
        assert_eq!(result.host, "");
        assert_eq!(result.path, "/action");

        // No path.
        let result = parse_protocol_url("myapp://host").unwrap();
        assert_eq!(result.scheme, "myapp");
        assert_eq!(result.host, "host");
        assert_eq!(result.path, "");

        // Decodes percent-encoded query values.
        let result = parse_protocol_url("myapp://x?key=hello%20world").unwrap();
        assert_eq!(
            result.query.get("key").map(String::as_str),
            Some("hello world")
        );

        // Last value wins for duplicate query keys.
        let result = parse_protocol_url("myapp://x?k=first&k=second").unwrap();
        assert_eq!(result.query.get("k").map(String::as_str), Some("second"));

        // Malformed or empty input.
        assert!(parse_protocol_url("").is_none());
        assert!(parse_protocol_url("notaurl").is_none());
        assert!(parse_protocol_url(":noscheme").is_none());

        // Lowercases the scheme.
        let result = parse_protocol_url("MyApp://host").unwrap();
        assert_eq!(result.scheme, "myapp");

        // No query string yields an empty map.
        let result = parse_protocol_url("myapp://host/path").unwrap();
        assert!(result.query.is_empty());
        clear_backend();
    }

    #[test]
    #[serial]
    fn register_protocol_scheme_rejects_invalid_and_reserved() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        // Invalid scheme without calling the backend.
        assert!(!register_protocol_scheme("123invalid"));
        assert!(!backend.registered.load(Ordering::SeqCst));
        // Reserved scheme.
        assert!(!register_protocol_scheme("https"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn register_protocol_schemes_registers_batch() {
        let _serial = serial();
        set_protocol_backend(Some(StubBackend::new()));
        // All succeed.
        assert!(register_protocol_schemes(&["myapp", "myapp2"]));

        // Skips backend for invalid schemes in the batch and reports false; the
        // valid scheme still registers (partial success).
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        assert!(!register_protocol_schemes(&["myapp", "http"]));
        assert!(backend.registered.load(Ordering::SeqCst));
        clear_backend();
    }

    #[test]
    #[serial]
    fn remove_protocol_scheme_as_default_removes_through_backend() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        set_protocol_scheme_as_default("myapp");
        assert!(remove_protocol_scheme_as_default("myapp"));
        assert!(!is_protocol_scheme_default("myapp"));
        clear_backend();
    }

    #[test]
    #[serial]
    fn unregister_protocol_schemes_unregisters_batch() {
        let _serial = serial();
        let backend = StubBackend::new();
        set_protocol_backend(Some(backend.clone()));
        register_protocol_scheme("myapp");
        assert!(unregister_protocol_schemes(&["myapp", "myapp2"]));
        clear_backend();
    }
}
