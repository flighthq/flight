use flight_entity::Ref;
use flight_geometry::Rectangle;
use flight_textformat::TextFormat;

use crate::rich_text_content::*;
use crate::text_bounds::*;
use crate::text_layout::*;
use crate::text_layout_group::*;
use crate::text_layout_measure::*;
use crate::text_metrics::*;
use crate::types::*;

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

impl RichTextContent {
    pub fn new() -> Self {
        return create_rich_text_content();
    }
}

impl TextAutoSize {
    pub fn as_str(&self) -> &'static str {
        return get_text_auto_size_string(*self);
    }
}

impl TextBoundsSpec {
    pub fn compute_height(&self, layout: &TextLayoutResult) -> f32 {
        return compute_text_bounds_height(self, layout);
    }

    pub fn compute_offset_x(&self, layout: &TextLayoutResult) -> f32 {
        return compute_text_bounds_offset_x(self, layout);
    }

    pub fn compute_rectangle(&self, out: &mut Rectangle, layout: &TextLayoutResult) {
        compute_text_bounds_rectangle(out, self, layout);
    }

    pub fn compute_width(&self, layout: &TextLayoutResult) -> f32 {
        return compute_text_bounds_width(self, layout);
    }
}

impl TextJustification {
    pub fn as_str(&self) -> &'static str {
        return get_text_justification_string(*self);
    }
}

impl TextLayoutGroup {
    pub fn new(format: Ref<TextFormat>) -> Self {
        return create_text_layout_group(format);
    }
}

impl TextLayoutMeasureState {
    pub fn new() -> Self {
        return create_text_layout_measure_state();
    }

    pub fn get_provider(
        &self,
        host_text_shaper: Option<&flight_textshaper::HostTextShaperCapability>,
    ) -> Option<flight_textshaper::TextMeasureFunction> {
        return get_text_layout_measure_provider(self, host_text_shaper);
    }

    pub fn set_provider(&mut self, provider: Option<flight_textshaper::TextMeasureFunction>) {
        set_text_layout_measure_provider(self, provider);
    }
}

impl TextLayoutResult {
    pub fn new() -> Self {
        return create_text_layout_result();
    }

    pub fn compute(&mut self, params: &TextLayoutParams) {
        compute_text_layout(self, params);
    }

    pub fn is_truncated(&self, params: &TextLayoutParams) -> bool {
        return is_text_layout_truncated(self, params);
    }
}

impl TextMetrics {
    pub fn new() -> Self {
        return create_text_metrics();
    }

    pub fn get(&mut self, layout: &TextLayoutResult) {
        get_text_metrics(self, layout);
    }
}

impl TextVerticalAlign {
    pub fn as_str(&self) -> &'static str {
        return get_text_vertical_align_string(*self);
    }
}
