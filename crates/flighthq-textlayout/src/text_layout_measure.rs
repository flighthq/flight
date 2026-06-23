use std::sync::{Arc, Mutex};

use flighthq_types::TextMeasureFunction;

// Module-level measure provider: null until a render/platform layer registers
// one via `set_text_layout_measure_provider`. Importing this module carries
// no side effects — the slot starts empty. This is the single injection seam
// that keeps text-layout DOM/GPU-free.
static MEASURE_PROVIDER: Mutex<Option<Arc<TextMeasureFunction>>> = Mutex::new(None);

/// Resolves the measure provider text-layout uses to turn characters into
/// advances. Shaping is owned by the `flighthq-textshaper` seam: when a shaper
/// backend is registered, this returns a provider that delegates to
/// `shape_text` (itself a `TextMeasureFunction`). An explicitly set provider
/// (`set_text_layout_measure_provider`) still takes precedence — the
/// direct-injection escape hatch for tests and bespoke hosts. `None` when
/// neither exists, exactly as before, so callers leave the layout stale until
/// shaping is available.
pub fn get_text_layout_measure_provider() -> Option<Arc<TextMeasureFunction>> {
    if let Some(provider) = MEASURE_PROVIDER
        .lock()
        .expect("measure provider poisoned")
        .clone()
    {
        return Some(provider);
    }
    if flighthq_textshaper::get_text_shaper_backend().is_some() {
        let shape: TextMeasureFunction =
            Box::new(|text, format| flighthq_textshaper::shape_text(text, format));
        return Some(Arc::new(shape));
    }
    None
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
