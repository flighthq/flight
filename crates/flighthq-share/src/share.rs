//! Share free functions and backend management.
//!
//! Ports `@flighthq/share`. Mirrors the TS contract that there is *always* a
//! backend: [`get_share_backend`] lazily installs a default when none is set, so
//! it never panics. The default is the sentinel web backend
//! ([`create_web_share_backend`]), which returns `false` for `share`,
//! `can_share`, and `is_available` — the native equivalent of the Web Share API
//! being absent (the TS jsdom case). A native/mobile host replaces it via
//! [`set_share_backend`].

use flighthq_signals::{Signal, emit_signal};
use flighthq_types::{ShareBackend, ShareContent, ShareOptions, ShareResult, ShareSignals};
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

/// Attaches `signals` to receive share result events emitted by
/// [`share_content_with_result`] calls. A prior subscription on this signals
/// group is torn down first. Pair with [`detach_share_signals`] /
/// [`dispose_share_signals`].
///
/// Note: [`share_content`] (the boolean convenience wrapper) does *not* emit
/// signals — only [`share_content_with_result`] emits `on_share_result`.
pub fn attach_share_signals(signals: &ShareSignals) {
    detach_share_signals(signals);
    let key = signals as *const ShareSignals as usize;
    let mut guard = SIGNAL_LISTENERS
        .lock()
        .expect("share signal listeners mutex poisoned");
    guard.push((key, signals.on_share_result.clone()));
}

/// Returns `true` when the active backend can share the given content. Returns
/// `false` when sharing is unavailable or the content is not shareable by this
/// platform. Distinct from [`is_share_available`]: that probe asks whether
/// sharing is possible at all; this asks whether this specific content is
/// shareable.
pub fn can_share_content(content: &ShareContent) -> bool {
    get_share_backend().can_share(content)
}

/// Builds the default web share backend.
///
/// Without a host, sharing is not guaranteed: `share` resolves to `false`,
/// `share_with_result` resolves to a dismissed-false/completed-false result,
/// and `can_share` / `is_available` return `false` — the native equivalent of
/// the Web Share API being absent (jsdom, unsupported browsers) or the user
/// cancelling. A native host installs its own backend via [`set_share_backend`].
pub fn create_web_share_backend() -> Arc<dyn ShareBackend> {
    Arc::new(WebShareBackend)
}

/// Stops delivery to `signals` and forgets its subscription. Safe to call when
/// not attached.
pub fn detach_share_signals(signals: &ShareSignals) {
    let key = signals as *const ShareSignals as usize;
    let mut guard = SIGNAL_LISTENERS
        .lock()
        .expect("share signal listeners mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        guard.remove(pos);
    }
}

/// Releases `signals` for garbage collection by detaching its subscription. The
/// signals remain plain memory afterward.
pub fn dispose_share_signals(signals: &ShareSignals) {
    detach_share_signals(signals);
}

/// Enables a signals group for share result events. Signals stay inert until
/// [`attach_share_signals`] is called. This is the opt-in; the cost is assumed
/// when attached.
pub fn enable_share_signals() -> ShareSignals {
    ShareSignals::default()
}

/// Returns the active share backend, or a lazily-created web default. There is
/// always a backend.
pub fn get_share_backend() -> Arc<dyn ShareBackend> {
    let mut guard = BACKEND.lock().expect("share backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => {
            let backend = create_web_share_backend();
            *guard = Some(Arc::clone(&backend));
            backend
        }
    }
}

/// Returns `true` when the active backend's platform supports sharing at all
/// (capability-level probe, independent of any content). Distinct from
/// [`can_share_content`]: this asks "can this platform share?" while
/// `can_share_content` asks "is this specific content shareable?".
pub fn is_share_available() -> bool {
    get_share_backend().is_available()
}

/// Returns `true` when `content` has at least one populated field (title, text,
/// url, or a non-empty files array). The Web Share API requires at least one
/// field; calling [`share_content`] with an empty payload returns `false`
/// immediately rather than forwarding to the backend (which may throw on web).
pub fn is_share_content_valid(content: &ShareContent) -> bool {
    if content.title.as_deref().is_some_and(|t| !t.is_empty()) {
        return true;
    }
    if content.text.as_deref().is_some_and(|t| !t.is_empty()) {
        return true;
    }
    if content.url.as_deref().is_some_and(|u| !u.is_empty()) {
        return true;
    }
    if !content.files.is_empty() {
        return true;
    }
    false
}

/// Installs a native host share backend. Pass `None` to fall back to the web
/// default.
pub fn set_share_backend(backend: Option<Arc<dyn ShareBackend>>) {
    let mut guard = BACKEND.lock().expect("share backend mutex poisoned");
    *guard = backend;
}

/// Opens the native share sheet with the given content. Resolves `true` on
/// success, `false` when the host denies, the user cancels, or sharing is
/// unavailable. An empty content payload (no title/text/url/files) returns
/// `false` immediately rather than forwarding to the backend. Pass `options`
/// to control presentation on native hosts.
pub async fn share_content(content: &ShareContent, options: Option<&ShareOptions>) -> bool {
    if !is_share_content_valid(content) {
        return false;
    }
    get_share_backend().share(content, options).await
}

/// Opens the native share sheet and returns a full [`ShareResult`] describing
/// completion, cancellation, and which activity/app was chosen. Emits
/// `on_share_result` on all attached [`ShareSignals`] groups. An empty content
/// payload returns a `completed: false` result immediately. Pass `options` to
/// control presentation on native hosts.
pub async fn share_content_with_result(
    content: &ShareContent,
    options: Option<&ShareOptions>,
) -> ShareResult {
    if !is_share_content_valid(content) {
        return ShareResult::default();
    }
    let result = get_share_backend()
        .share_with_result(content, options)
        .await;
    let listeners: Vec<Signal<ShareResult>> = {
        let guard = SIGNAL_LISTENERS
            .lock()
            .expect("share signal listeners mutex poisoned");
        guard.iter().map(|(_, sig)| sig.clone()).collect()
    };
    for signal in &listeners {
        emit_signal(signal, &result);
    }
    result
}

/// Opens the share sheet with a plain text payload. A convenience wrapper over
/// [`share_content`].
pub async fn share_text(text: &str, options: Option<&ShareOptions>) -> bool {
    let content = ShareContent {
        text: Some(text.to_string()),
        ..Default::default()
    };
    share_content(&content, options).await
}

/// Opens the share sheet with a URL payload. A convenience wrapper over
/// [`share_content`].
pub async fn share_url(url: &str, options: Option<&ShareOptions>) -> bool {
    let content = ShareContent {
        url: Some(url.to_string()),
        ..Default::default()
    };
    share_content(&content, options).await
}

/// The sentinel web backend. Reports unavailable everywhere because the native
/// runtime has no Web Share API; a host overrides it via [`set_share_backend`].
struct WebShareBackend;

impl ShareBackend for WebShareBackend {
    fn is_available(&self) -> bool {
        false
    }

    fn share(
        &self,
        _content: &ShareContent,
        _options: Option<&ShareOptions>,
    ) -> Pin<Box<dyn Future<Output = bool> + Send>> {
        Box::pin(async { false })
    }

    fn share_with_result(
        &self,
        _content: &ShareContent,
        _options: Option<&ShareOptions>,
    ) -> Pin<Box<dyn Future<Output = ShareResult> + Send>> {
        Box::pin(async { ShareResult::default() })
    }

    fn can_share(&self, _content: &ShareContent) -> bool {
        false
    }
}

static BACKEND: Mutex<Option<Arc<dyn ShareBackend>>> = Mutex::new(None);

// Signals groups attached via attach_share_signals, keyed by the group's
// address (matching the TS `Map<ShareSignals, true>` object-identity registry).
// The stored Signal clone shares the group's emitter, so emitting on it reaches
// the group's listeners.
static SIGNAL_LISTENERS: Mutex<Vec<(usize, Signal<ShareResult>)>> = Mutex::new(Vec::new());

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use flighthq_types::ShareFile;
    use serial_test::serial;
    use std::sync::Mutex as StdMutex;

    struct FakeBackend {
        shared: StdMutex<Option<ShareContent>>,
    }

    impl FakeBackend {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                shared: StdMutex::new(None),
            })
        }
    }

    impl ShareBackend for FakeBackend {
        fn is_available(&self) -> bool {
            true
        }

        fn share(
            &self,
            content: &ShareContent,
            _options: Option<&ShareOptions>,
        ) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            *self.shared.lock().unwrap() = Some(content.clone());
            Box::pin(async { true })
        }

        fn share_with_result(
            &self,
            content: &ShareContent,
            _options: Option<&ShareOptions>,
        ) -> Pin<Box<dyn Future<Output = ShareResult> + Send>> {
            *self.shared.lock().unwrap() = Some(content.clone());
            Box::pin(async {
                ShareResult {
                    completed: true,
                    activity_type: None,
                    dismissed: false,
                }
            })
        }

        fn can_share(&self, _content: &ShareContent) -> bool {
            true
        }
    }

    fn text_content(text: &str) -> ShareContent {
        ShareContent {
            text: Some(text.to_string()),
            ..Default::default()
        }
    }

    fn png_file() -> ShareFile {
        ShareFile {
            name: "img.png".to_string(),
            mime_type: "image/png".to_string(),
            data_url: "data:image/png;base64,abc".to_string(),
        }
    }

    mod attach_share_signals {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn replaces_an_existing_attachment_idempotently() {
            set_share_backend(Some(FakeBackend::new()));
            let signals = enable_share_signals();
            attach_share_signals(&signals);
            attach_share_signals(&signals); // second attach should not double-fire
            let count = Arc::new(StdMutex::new(0u32));
            let count_clone = Arc::clone(&count);
            let _guard = connect_signal(
                &signals.on_share_result,
                Arc::new(move |_: &ShareResult| {
                    *count_clone.lock().unwrap() += 1;
                }),
                Default::default(),
            );
            share_content_with_result(&text_content("hi"), None).await;
            assert_eq!(*count.lock().unwrap(), 1);
            detach_share_signals(&signals);
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn emits_on_share_result_after_attach() {
            set_share_backend(Some(FakeBackend::new()));
            let signals = enable_share_signals();
            attach_share_signals(&signals);
            let results = Arc::new(StdMutex::new(Vec::<ShareResult>::new()));
            let results_clone = Arc::clone(&results);
            let _guard = connect_signal(
                &signals.on_share_result,
                Arc::new(move |r: &ShareResult| {
                    results_clone.lock().unwrap().push(r.clone());
                }),
                Default::default(),
            );
            share_content_with_result(&text_content("hello"), None).await;
            let results = results.lock().unwrap();
            assert_eq!(results.len(), 1);
            assert!(results[0].completed);
            drop(results);
            detach_share_signals(&signals);
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn does_not_emit_after_detach() {
            set_share_backend(Some(FakeBackend::new()));
            let signals = enable_share_signals();
            attach_share_signals(&signals);
            detach_share_signals(&signals);
            let count = Arc::new(StdMutex::new(0u32));
            let count_clone = Arc::clone(&count);
            let _guard = connect_signal(
                &signals.on_share_result,
                Arc::new(move |_: &ShareResult| {
                    *count_clone.lock().unwrap() += 1;
                }),
                Default::default(),
            );
            share_content_with_result(&text_content("hi"), None).await;
            assert_eq!(*count.lock().unwrap(), 0);
            set_share_backend(None);
        }
    }

    mod can_share_content {
        use super::*;

        #[test]
        #[serial]
        fn reflects_the_backend_result() {
            set_share_backend(Some(FakeBackend::new()));
            assert!(can_share_content(&text_content("x")));
            set_share_backend(None);
        }

        #[test]
        #[serial]
        fn returns_false_from_the_web_backend_without_a_host() {
            set_share_backend(None);
            assert!(!can_share_content(&text_content("x")));
        }

        #[test]
        #[serial]
        fn returns_true_when_files_can_be_shared() {
            set_share_backend(Some(FakeBackend::new()));
            let content = ShareContent {
                files: vec![png_file()],
                ..Default::default()
            };
            assert!(can_share_content(&content));
            set_share_backend(None);
        }
    }

    mod create_web_share_backend {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn returns_false_for_share_can_share_and_is_available_when_the_api_is_absent() {
            let backend = create_web_share_backend();
            assert!(!backend.is_available());
            assert!(!backend.share(&text_content("x"), None).await);
            assert!(!backend.can_share(&text_content("x")));
        }

        #[tokio::test]
        #[serial]
        async fn share_with_result_returns_completed_false_dismissed_false_when_api_absent() {
            let backend = create_web_share_backend();
            let result = backend.share_with_result(&text_content("x"), None).await;
            assert!(!result.completed);
            assert!(!result.dismissed);
            assert_eq!(result.activity_type, None);
        }
    }

    mod detach_share_signals {
        use super::*;

        #[test]
        #[serial]
        fn is_safe_to_call_when_not_attached() {
            let signals = enable_share_signals();
            detach_share_signals(&signals); // must not panic
        }
    }

    mod dispose_share_signals {
        use super::*;

        #[test]
        #[serial]
        fn releases_signal_group_without_panicking() {
            let signals = enable_share_signals();
            attach_share_signals(&signals);
            dispose_share_signals(&signals); // must not panic
        }
    }

    mod enable_share_signals {
        use super::*;

        #[test]
        #[serial]
        fn returns_a_signals_group_with_on_share_result() {
            let signals = enable_share_signals();
            // The signal exists and is connectable.
            let _guard = connect_signal(
                &signals.on_share_result,
                Arc::new(|_: &ShareResult| {}),
                Default::default(),
            );
        }
    }

    mod get_share_backend {
        use super::*;

        #[test]
        #[serial]
        fn falls_back_to_a_web_backend() {
            set_share_backend(None);
            assert!(!get_share_backend().can_share(&text_content("x")));
        }

        #[test]
        #[serial]
        fn returns_the_registered_backend() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            assert!(get_share_backend().can_share(&text_content("x")));
            set_share_backend(None);
        }
    }

    mod is_share_available {
        use super::*;

        #[test]
        #[serial]
        fn returns_false_from_the_web_backend_without_a_host() {
            set_share_backend(None);
            assert!(!is_share_available());
        }

        #[test]
        #[serial]
        fn returns_true_when_the_backend_reports_available() {
            set_share_backend(Some(FakeBackend::new()));
            assert!(is_share_available());
            set_share_backend(None);
        }
    }

    mod is_share_content_valid {
        use super::*;

        #[test]
        fn returns_false_for_empty_content() {
            assert!(!is_share_content_valid(&ShareContent::default()));
        }

        #[test]
        fn returns_false_for_empty_strings() {
            let content = ShareContent {
                title: Some(String::new()),
                text: Some(String::new()),
                url: Some(String::new()),
                ..Default::default()
            };
            assert!(!is_share_content_valid(&content));
        }

        #[test]
        fn returns_false_for_empty_files_array() {
            let content = ShareContent {
                files: Vec::new(),
                ..Default::default()
            };
            assert!(!is_share_content_valid(&content));
        }

        #[test]
        fn returns_true_for_non_empty_title() {
            let content = ShareContent {
                title: Some("Hello".to_string()),
                ..Default::default()
            };
            assert!(is_share_content_valid(&content));
        }

        #[test]
        fn returns_true_for_non_empty_text() {
            assert!(is_share_content_valid(&text_content("x")));
        }

        #[test]
        fn returns_true_for_non_empty_url() {
            let content = ShareContent {
                url: Some("https://example.com".to_string()),
                ..Default::default()
            };
            assert!(is_share_content_valid(&content));
        }

        #[test]
        fn returns_true_for_non_empty_files_array() {
            let content = ShareContent {
                files: vec![png_file()],
                ..Default::default()
            };
            assert!(is_share_content_valid(&content));
        }
    }

    mod set_share_backend {
        use super::*;

        #[test]
        #[serial]
        fn clears_back_to_the_web_fallback_when_passed_none() {
            set_share_backend(Some(FakeBackend::new()));
            set_share_backend(None);
            assert!(!get_share_backend().can_share(&text_content("x")));
        }
    }

    mod share_content {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn shares_via_the_active_backend() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            let content = ShareContent {
                title: Some("t".to_string()),
                url: Some("u".to_string()),
                ..Default::default()
            };
            assert!(share_content(&content, None).await);
            let shared = backend.shared.lock().unwrap();
            let shared = shared.as_ref().expect("backend recorded shared content");
            assert_eq!(shared.title.as_deref(), Some("t"));
            assert_eq!(shared.url.as_deref(), Some("u"));
            assert_eq!(shared.text, None);
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn returns_false_from_the_web_backend_without_a_host() {
            set_share_backend(None);
            assert!(!share_content(&text_content("x"), None).await);
        }

        #[tokio::test]
        #[serial]
        async fn returns_false_immediately_for_empty_content_without_calling_backend() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            assert!(!share_content(&ShareContent::default(), None).await);
            assert!(backend.shared.lock().unwrap().is_none());
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn shares_files() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            let content = ShareContent {
                files: vec![png_file()],
                ..Default::default()
            };
            assert!(share_content(&content, None).await);
            let shared = backend.shared.lock().unwrap();
            let shared = shared.as_ref().expect("backend recorded shared content");
            assert_eq!(shared.files, vec![png_file()]);
            set_share_backend(None);
        }
    }

    mod share_content_with_result {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn returns_completed_result_from_backend() {
            set_share_backend(Some(FakeBackend::new()));
            let result = share_content_with_result(&text_content("hello"), None).await;
            assert!(result.completed);
            assert!(!result.dismissed);
            assert_eq!(result.activity_type, None);
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn returns_empty_result_for_empty_content_without_calling_backend() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            let result = share_content_with_result(&ShareContent::default(), None).await;
            assert!(!result.completed);
            assert!(backend.shared.lock().unwrap().is_none());
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn emits_on_share_result_to_attached_signal_groups() {
            set_share_backend(Some(FakeBackend::new()));
            let signals = enable_share_signals();
            attach_share_signals(&signals);
            let results = Arc::new(StdMutex::new(Vec::<ShareResult>::new()));
            let results_clone = Arc::clone(&results);
            let _guard = connect_signal(
                &signals.on_share_result,
                Arc::new(move |r: &ShareResult| {
                    results_clone.lock().unwrap().push(r.clone());
                }),
                Default::default(),
            );
            let content = ShareContent {
                url: Some("https://example.com".to_string()),
                ..Default::default()
            };
            share_content_with_result(&content, None).await;
            let results = results.lock().unwrap();
            assert_eq!(results.len(), 1);
            assert!(results[0].completed);
            drop(results);
            detach_share_signals(&signals);
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn does_not_emit_to_detached_signal_groups() {
            set_share_backend(Some(FakeBackend::new()));
            let signals = enable_share_signals();
            attach_share_signals(&signals);
            detach_share_signals(&signals);
            let count = Arc::new(StdMutex::new(0u32));
            let count_clone = Arc::clone(&count);
            let _guard = connect_signal(
                &signals.on_share_result,
                Arc::new(move |_: &ShareResult| {
                    *count_clone.lock().unwrap() += 1;
                }),
                Default::default(),
            );
            share_content_with_result(&text_content("hi"), None).await;
            assert_eq!(*count.lock().unwrap(), 0);
            set_share_backend(None);
        }

        #[tokio::test]
        #[serial]
        async fn returns_false_from_web_backend_without_a_host() {
            set_share_backend(None);
            let result = share_content_with_result(&text_content("x"), None).await;
            assert!(!result.completed);
        }
    }

    mod share_text {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn shares_via_share_content_with_text_payload() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            assert!(share_text("hello world", None).await);
            let shared = backend.shared.lock().unwrap();
            let shared = shared.as_ref().expect("backend recorded shared content");
            assert_eq!(shared.text.as_deref(), Some("hello world"));
            set_share_backend(None);
        }
    }

    mod share_url {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn shares_via_share_content_with_url_payload() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            assert!(share_url("https://example.com", None).await);
            let shared = backend.shared.lock().unwrap();
            let shared = shared.as_ref().expect("backend recorded shared content");
            assert_eq!(shared.url.as_deref(), Some("https://example.com"));
            set_share_backend(None);
        }
    }
}
