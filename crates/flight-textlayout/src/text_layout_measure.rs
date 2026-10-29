//! flight-compiler: target-native
//! flight-compiler: root-only getTextLayoutMeasureProvider setTextLayoutMeasureProvider

use std::sync::Arc;

use flight_textshaper::{HostTextShaperCapability, TextMeasureFunction, measure_text};

use crate::text_layout_measure_state::TextLayoutMeasureState;

// flight-lint: allow(conform-extra) D5 explicit caller-owned state replaces the source module provider slot
pub fn create_text_layout_measure_state() -> TextLayoutMeasureState {
    return TextLayoutMeasureState::default();
}

// flight-lint: allow(conform-params) D5 caller-owned state replaces the source module provider slot
pub fn get_text_layout_measure_provider(
    state: &TextLayoutMeasureState,
    host_text_shaper: Option<&HostTextShaperCapability>,
) -> Option<TextMeasureFunction> {
    if let Some(measure) = &state.measure_provider {
        return Some(measure.clone());
    }
    let host_text_shaper = host_text_shaper?.clone();
    return Some(Arc::new(move |text, format| {
        return measure_text(&host_text_shaper, text, format);
    }));
}

// flight-lint: allow(conform-params) D5 caller-owned state replaces the source module provider slot
pub fn set_text_layout_measure_provider(
    state: &mut TextLayoutMeasureState,
    measure: Option<TextMeasureFunction>,
) {
    state.measure_provider = measure;
}
