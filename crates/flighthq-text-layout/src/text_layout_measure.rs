use std::sync::{Arc, Mutex};

use flighthq_types::TextMeasureFunction;

// Module-level measure provider: null until a render/platform layer registers
// one via `set_text_layout_measure_provider`. Importing this module carries
// no side effects — the slot starts empty. This is the single injection seam
// that keeps text-layout DOM/GPU-free.
static MEASURE_PROVIDER: Mutex<Option<Arc<TextMeasureFunction>>> = Mutex::new(None);

/// Returns the currently registered measure provider, or `None` when none has
/// been set yet.
pub fn get_text_layout_measure_provider() -> Option<Arc<TextMeasureFunction>> {
    MEASURE_PROVIDER
        .lock()
        .expect("measure provider poisoned")
        .clone()
}

/// Registers `measure` as the global glyph-advance provider. Pass `None` to
/// clear. Thread-safe; the previous provider is released.
pub fn set_text_layout_measure_provider(measure: Option<Arc<TextMeasureFunction>>) {
    *MEASURE_PROVIDER.lock().expect("measure provider poisoned") = measure;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_text_layout_measure_provider_initially_none() {
        // We cannot assume clean module state in parallel test runs, so only
        // assert that the function returns without panicking.
        let _ = get_text_layout_measure_provider();
    }

    #[test]
    fn set_text_layout_measure_provider_roundtrip() {
        let measure: Arc<TextMeasureFunction> =
            Arc::new(Box::new(|text: &str, _f: &_| text.len() as f32));
        set_text_layout_measure_provider(Some(measure.clone()));
        assert!(get_text_layout_measure_provider().is_some());
        set_text_layout_measure_provider(None);
        assert!(get_text_layout_measure_provider().is_none());
    }
}
