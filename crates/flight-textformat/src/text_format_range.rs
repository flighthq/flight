use crate::TextFormat;
use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_the_type_owned_factory() {
        let format = std::sync::Arc::new(std::sync::RwLock::new(TextFormat {
            align: None,
            block_indent: None,
            bold: None,
            bullet: None,
            color: None,
            font: None,
            indent: None,
            italic: None,
            kerning: None,
            leading: None,
            left_margin: None,
            letter_spacing: None,
            list_marker: None,
            right_margin: None,
            size: None,
            strikethrough: None,
            tab_stops: None,
            target: None,
            underline: None,
            url: None,
            variations: None,
        }));
        format.write().unwrap().bold = Some(true);
        let method = TextFormatRange::new(format.clone(), 1, 3);
        let function = create_text_format_range(format.clone(), 1, 3);
        assert_eq!((method.start, method.end), (function.start, function.end));
        assert!(std::sync::Arc::ptr_eq(&method.format, &function.format));
        assert!(std::sync::Arc::ptr_eq(&method.format, &format));
    }
}

/// Half-open UTF-16 code-unit offsets (D15), with the same format object as the caller.
#[derive(Clone, Debug, Default)]
pub struct TextFormatRange {
    runtime: EntityRuntimeSlot,
    pub end: usize,
    pub format: Ref<TextFormat>,
    pub start: usize,
}

/// Mechanically relocated from textlayout/textFormatRange.ts to its approved D8 type owner.
pub fn create_text_format_range(
    format: Ref<TextFormat>,
    start: usize,
    end: usize,
) -> TextFormatRange {
    let mut out: TextFormatRange = allocate_entity();
    initialize_text_format_range(&mut out, format, start, end);
    return out;
}

pub fn initialize_text_format_range(
    out: &mut TextFormatRange,
    format: Ref<TextFormat>,
    start: usize,
    end: usize,
) {
    out.end = end;
    out.format = format;
    out.start = start;
}

flight_entity::impl_entity!(TextFormatRange);

impl TextFormatRange {
    pub fn new(format: Ref<TextFormat>, start: usize, end: usize) -> Self {
        return create_text_format_range(format, start, end);
    }
}
