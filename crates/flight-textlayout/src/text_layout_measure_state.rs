//! flight-compiler: rust-only — caller-owned Rust state replaces the target-native module slot.

use flight_textshaper::TextMeasureFunction;

#[derive(Clone, Default)]
pub struct TextLayoutMeasureState {
    pub(crate) measure_provider: Option<TextMeasureFunction>,
}
