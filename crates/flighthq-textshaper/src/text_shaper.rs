use std::sync::{Arc, Mutex};

use flighthq_types::{TextFormat, TextShaperBackend};

use crate::text_shaper_hooks::dispatch_text_shaper_backend_hook;

/// Returns the active text-shaper backend, or `None` when none has been registered. Unlike the
/// always-on platform capabilities (clipboard, storage), shaping has no light default that lives
/// here: the canvas backend needs DOM + font-string computation, and the native full-glyph backend
/// is HarfBuzz/rustybuzz — both are installed via [`set_text_shaper_backend`]. Callers fall back to
/// leaving text unmeasured until a backend exists.
pub fn get_text_shaper_backend() -> Option<Arc<dyn TextShaperBackend>> {
    BACKEND
        .lock()
        .expect("text shaper backend poisoned")
        .clone()
}

/// Installs a text-shaper backend; pass `None` to clear it. Last write wins — registering over an
/// existing backend replaces it, which is how a host swaps the canvas default for HarfBuzz. Never
/// panics on re-registration.
pub fn set_text_shaper_backend(backend: Option<Arc<dyn TextShaperBackend>>) {
    {
        *BACKEND.lock().expect("text shaper backend poisoned") = backend.clone();
    }
    dispatch_text_shaper_backend_hook(backend.as_ref());
}

/// Shapes `text` in `format` to its horizontal advance, in pixels, via the active backend. Advances
/// are all current shaping produces (canvas `measureText`); this is the single value text-layout
/// needs to place each character. Returns the sentinel `-1.0` when no backend is registered
/// (expected before setup), so callers can distinguish "unmeasurable" from a real zero-width
/// advance.
pub fn shape_text(text: &str, format: &TextFormat) -> f32 {
    match get_text_shaper_backend() {
        Some(backend) => backend.measure_text(text, format),
        None => -1.0,
    }
}

static BACKEND: Mutex<Option<Arc<dyn TextShaperBackend>>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use serial_test::serial;

    use super::*;

    struct FixedShaper(f32);
    impl TextShaperBackend for FixedShaper {
        fn measure_text(&self, _text: &str, _format: &TextFormat) -> f32 {
            self.0
        }
    }

    #[test]
    #[serial]
    fn get_text_shaper_backend_initially_none() {
        set_text_shaper_backend(None);
        assert!(get_text_shaper_backend().is_none());
    }

    #[test]
    #[serial]
    fn set_text_shaper_backend_roundtrip() {
        set_text_shaper_backend(Some(Arc::new(FixedShaper(7.0))));
        assert!(get_text_shaper_backend().is_some());
        set_text_shaper_backend(None);
        assert!(get_text_shaper_backend().is_none());
    }

    #[test]
    #[serial]
    fn shape_text_returns_sentinel_without_backend() {
        set_text_shaper_backend(None);
        assert_eq!(shape_text("hello", &TextFormat::default()), -1.0);
    }

    #[test]
    #[serial]
    fn shape_text_delegates_to_backend() {
        set_text_shaper_backend(Some(Arc::new(FixedShaper(42.0))));
        assert_eq!(shape_text("hello", &TextFormat::default()), 42.0);
        set_text_shaper_backend(None);
    }
}
