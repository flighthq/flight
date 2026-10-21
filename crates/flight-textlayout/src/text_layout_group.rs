use flight_entity::{Ref, allocate_entity};
use flight_textformat::TextFormat;

use crate::types::TextLayoutGroup;

pub fn create_text_layout_group(
    format: Ref<TextFormat>,
    start_index: usize,
    end_index: usize,
) -> TextLayoutGroup {
    let mut out: TextLayoutGroup = allocate_entity();
    initialize_text_layout_group(&mut out, format, start_index, end_index);
    return out;
}

pub fn initialize_text_layout_group(
    out: &mut TextLayoutGroup,
    format: Ref<TextFormat>,
    start_index: usize,
    end_index: usize,
) {
    out.ascent = 0.0;
    out.descent = 0.0;
    out.end_index = end_index;
    out.format = format;
    out.height = 0.0;
    out.leading = 0.0;
    out.line_index = 0;
    out.offset_x = 0.0;
    out.offset_y = 0.0;
    out.positions.clear();
    out.start_index = start_index;
    out.width = 0.0;
}
