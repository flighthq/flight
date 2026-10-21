use flight_entity::Ref;
use flight_textformat::{TextFormat, TextFormatRange};

pub fn create_text_format_range(
    format: Ref<TextFormat>,
    start: usize,
    end: usize,
) -> TextFormatRange {
    return flight_textformat::create_text_format_range(format, start, end);
}

pub fn initialize_text_format_range(
    out: &mut TextFormatRange,
    format: Ref<TextFormat>,
    start: usize,
    end: usize,
) {
    flight_textformat::contract::initialize_text_format_range(out, format, start, end);
}
