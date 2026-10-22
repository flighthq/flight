use flight_entity::{Ref, allocate_entity};
use flight_textformat::TextFormat;

use crate::types::TextLayoutGroup;

// flight-lint: allow(conform-params) Principalc0f9227c D23: retain the required defining format reference; authored range indices are assigned after construction
pub fn create_text_layout_group(format: Ref<TextFormat>) -> TextLayoutGroup {
    let mut out: TextLayoutGroup = allocate_entity();
    initialize_text_layout_group(&mut out, format);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23: construction retains the required format reference and initializes range defaults before authored assignment
pub fn initialize_text_layout_group(out: &mut TextLayoutGroup, format: Ref<TextFormat>) {
    out.ascent = 0.0;
    out.descent = 0.0;
    out.end_index = 0;
    out.format = format;
    out.height = 0.0;
    out.leading = 0.0;
    out.line_index = 0;
    out.offset_x = 0.0;
    out.offset_y = 0.0;
    out.positions.clear();
    out.start_index = 0;
    out.width = 0.0;
    return;
}
