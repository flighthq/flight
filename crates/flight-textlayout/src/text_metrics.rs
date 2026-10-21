use flight_entity::allocate_entity;

use crate::types::{TextLayoutResult, TextMetrics};

pub fn create_text_metrics() -> TextMetrics {
    let mut out: TextMetrics = allocate_entity();
    initialize_text_metrics(&mut out);
    return out;
}

pub fn initialize_text_metrics(out: &mut TextMetrics) {
    out.height = 0.0;
    out.num_lines = 0;
    out.width = 0.0;
}

pub fn get_text_metrics(out: &mut TextMetrics, layout: &TextLayoutResult) {
    out.width = layout.text_width.ceil();
    out.height = layout.text_height.ceil();
    out.num_lines = layout.num_lines;
}
