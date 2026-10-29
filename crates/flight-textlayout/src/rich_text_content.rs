//! flight-compiler: target-native
//! flight-compiler: root-only createRichTextContent

use flight_entity::allocate_entity;

use crate::types::RichTextContent;

pub fn create_rich_text_content() -> RichTextContent {
    let mut out: RichTextContent = allocate_entity();
    initialize_rich_text_content(&mut out);
    return out;
}

pub fn initialize_rich_text_content(out: &mut RichTextContent) {
    out.format_ranges.clear();
    out.text.clear();
}
