//! Share free functions and backend management.
//!
//! Ports `@flighthq/share`. Mirrors the TS contract that there is *always* a
//! backend: [`get_share_backend`] lazily installs a default when none is set, so
//! it never panics. The default is the sentinel web backend
//! ([`create_web_share_backend`]), which returns `false` for both `share` and
//! `can_share` — the native equivalent of the Web Share API being absent (the TS
//! jsdom case). A native/mobile host replaces it via [`set_share_backend`].

use flighthq_types::{ShareBackend, ShareContent};
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

/// Returns `true` when the active backend can share the given content. Returns
/// `false` when sharing is unavailable.
pub fn can_share_content(content: &ShareContent) -> bool {
    get_share_backend().can_share(content)
}

/// Builds the default web share backend.
///
/// Without a host, sharing is not guaranteed: `share` resolves to `false` and
/// `can_share` returns `false` — the native equivalent of the Web Share API
/// being absent (jsdom, unsupported browsers) or the user cancelling. A native
/// host installs its own backend via [`set_share_backend`].
pub fn create_web_share_backend() -> Arc<dyn ShareBackend> {
    Arc::new(WebShareBackend)
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

/// Installs a native host share backend. Pass `None` to fall back to the web
/// default.
pub fn set_share_backend(backend: Option<Arc<dyn ShareBackend>>) {
    let mut guard = BACKEND.lock().expect("share backend mutex poisoned");
    *guard = backend;
}

/// Opens the native share sheet with the given content. Resolves `true` on
/// success, `false` when the host denies, the user cancels, or sharing is
/// unavailable.
pub async fn share_content(content: &ShareContent) -> bool {
    get_share_backend().share(content).await
}

/// The sentinel web backend. Returns `false` everywhere because the native
/// runtime has no Web Share API; a host overrides it via [`set_share_backend`].
struct WebShareBackend;

impl ShareBackend for WebShareBackend {
    fn share(&self, _content: &ShareContent) -> Pin<Box<dyn Future<Output = bool> + Send>> {
        Box::pin(async { false })
    }

    fn can_share(&self, _content: &ShareContent) -> bool {
        false
    }
}

static BACKEND: Mutex<Option<Arc<dyn ShareBackend>>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use super::*;
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
        fn share(&self, content: &ShareContent) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            *self.shared.lock().unwrap() = Some(content.clone());
            Box::pin(async { true })
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
    }

    mod create_web_share_backend {
        use super::*;

        #[tokio::test]
        #[serial]
        async fn returns_false_for_share_and_can_share_when_the_api_is_absent() {
            let backend = create_web_share_backend();
            assert!(!backend.share(&text_content("x")).await);
            assert!(!backend.can_share(&text_content("x")));
        }
    }

    mod get_share_backend {
        use super::*;

        #[test]
        #[serial]
        fn falls_back_to_a_web_backend() {
            set_share_backend(None);
            // Always returns a backend; the web fallback reports unavailable.
            assert!(!get_share_backend().can_share(&text_content("x")));
        }

        #[test]
        #[serial]
        fn returns_the_registered_backend() {
            let backend = FakeBackend::new();
            set_share_backend(Some(Arc::clone(&backend) as Arc<dyn ShareBackend>));
            // The registered backend's distinctive behavior (can_share == true)
            // is observed through the registry.
            assert!(get_share_backend().can_share(&text_content("x")));
            set_share_backend(None);
        }
    }

    mod set_share_backend {
        use super::*;

        #[test]
        #[serial]
        fn clears_back_to_the_web_fallback_when_passed_none() {
            set_share_backend(Some(FakeBackend::new()));
            set_share_backend(None);
            // Falls back to the web default, which reports unavailable.
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
            assert!(share_content(&content).await);
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
            assert!(!share_content(&text_content("x")).await);
        }
    }
}
