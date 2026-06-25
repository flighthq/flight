use std::sync::{Arc, Mutex};

use flighthq_types::TextShaperBackend;

/// Type of the backend-change hook: invoked by [`super::set_text_shaper_backend`] with the new
/// backend (or `None` when cleared). Mirrors the TS `_textShaperBackendHook` slot — it lets another
/// module (e.g. `flighthq-textlayout`) observe shaper registration without a dependency cycle: the
/// shaper crate owns the slot and fires it, the observer installs into it.
pub type TextShaperBackendHook = Box<dyn Fn(Option<&Arc<dyn TextShaperBackend>>) + Send + Sync>;

/// Installs the backend-change hook; pass `None` to clear it. Last write wins — installing over an
/// existing hook replaces it. Once installed, [`super::set_text_shaper_backend`] invokes the hook
/// with each new backend. Mirrors the TS `_setTextShaperBackendHook`.
pub fn set_text_shaper_backend_hook(hook: Option<TextShaperBackendHook>) {
    *HOOK.lock().expect("text shaper backend hook poisoned") = hook;
}

/// Invokes the installed hook, if any, with the new backend. Called by
/// [`super::set_text_shaper_backend`]. Internal to the crate.
pub(crate) fn dispatch_text_shaper_backend_hook(backend: Option<&Arc<dyn TextShaperBackend>>) {
    if let Some(hook) = HOOK
        .lock()
        .expect("text shaper backend hook poisoned")
        .as_ref()
    {
        hook(backend);
    }
}

static HOOK: Mutex<Option<TextShaperBackendHook>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use flighthq_types::TextFormat;
    use serial_test::serial;

    use super::*;
    use crate::set_text_shaper_backend;

    struct TestBackend;
    impl TextShaperBackend for TestBackend {
        fn measure_text(&self, text: &str, _format: &TextFormat) -> f32 {
            text.len() as f32
        }
    }

    #[test]
    #[serial]
    fn set_text_shaper_backend_hook_invokes_on_new_backend() {
        let calls = Arc::new(AtomicUsize::new(0));
        let saw_some = Arc::new(AtomicUsize::new(0));
        let calls_c = calls.clone();
        let saw_some_c = saw_some.clone();
        set_text_shaper_backend_hook(Some(Box::new(move |backend| {
            calls_c.fetch_add(1, Ordering::SeqCst);
            if backend.is_some() {
                saw_some_c.fetch_add(1, Ordering::SeqCst);
            }
        })));
        set_text_shaper_backend(Some(Arc::new(TestBackend)));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(saw_some.load(Ordering::SeqCst), 1);
        set_text_shaper_backend_hook(None);
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn set_text_shaper_backend_hook_passes_none_when_cleared() {
        let saw_none = Arc::new(AtomicUsize::new(0));
        let saw_none_c = saw_none.clone();
        set_text_shaper_backend_hook(Some(Box::new(move |backend| {
            if backend.is_none() {
                saw_none_c.fetch_add(1, Ordering::SeqCst);
            }
        })));
        set_text_shaper_backend(None);
        assert_eq!(saw_none.load(Ordering::SeqCst), 1);
        set_text_shaper_backend_hook(None);
    }

    #[test]
    #[serial]
    fn set_text_shaper_backend_hook_none_stops_dispatch() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_c = calls.clone();
        set_text_shaper_backend_hook(Some(Box::new(move |_| {
            calls_c.fetch_add(1, Ordering::SeqCst);
        })));
        set_text_shaper_backend_hook(None);
        set_text_shaper_backend(Some(Arc::new(TestBackend)));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn set_text_shaper_backend_hook_last_write_wins() {
        let first = Arc::new(AtomicUsize::new(0));
        let second = Arc::new(AtomicUsize::new(0));
        let first_c = first.clone();
        let second_c = second.clone();
        set_text_shaper_backend_hook(Some(Box::new(move |_| {
            first_c.fetch_add(1, Ordering::SeqCst);
        })));
        set_text_shaper_backend_hook(Some(Box::new(move |_| {
            second_c.fetch_add(1, Ordering::SeqCst);
        })));
        set_text_shaper_backend(Some(Arc::new(TestBackend)));
        assert_eq!(first.load(Ordering::SeqCst), 0);
        assert_eq!(second.load(Ordering::SeqCst), 1);
        set_text_shaper_backend_hook(None);
        set_text_shaper_backend(None);
    }
}
