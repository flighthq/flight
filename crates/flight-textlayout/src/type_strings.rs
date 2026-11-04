use crate::types::{TextAutoSize, TextJustification, TextVerticalAlign};

// flight-lint: allow(conform-extra) D9 exact string table for types/TextAutoSize.ts; no source helper function exists
pub fn get_text_auto_size_string(value: TextAutoSize) -> &'static str {
    return match value {
        TextAutoSize::Center => "center",
        TextAutoSize::Left => "left",
        TextAutoSize::None => "none",
        TextAutoSize::Right => "right",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/TextJustification.ts; no source helper function exists
pub fn get_text_justification_string(value: TextJustification) -> &'static str {
    return match value {
        TextJustification::InterCharacter => "interCharacter",
        TextJustification::InterWord => "interWord",
        TextJustification::None => "none",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/TextVerticalAlign.ts; no source helper function exists
pub fn get_text_vertical_align_string(value: TextVerticalAlign) -> &'static str {
    return match value {
        TextVerticalAlign::Bottom => "bottom",
        TextVerticalAlign::Middle => "middle",
        TextVerticalAlign::Top => "top",
    };
}

// flight-lint: allow(conform-extra) D9 parser paired with the TextAutoSize table
pub fn parse_text_auto_size(value: &str) -> Option<TextAutoSize> {
    return match value {
        "center" => Some(TextAutoSize::Center),
        "left" => Some(TextAutoSize::Left),
        "none" => Some(TextAutoSize::None),
        "right" => Some(TextAutoSize::Right),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 parser paired with the TextJustification table
pub fn parse_text_justification(value: &str) -> Option<TextJustification> {
    return match value {
        "interCharacter" => Some(TextJustification::InterCharacter),
        "interWord" => Some(TextJustification::InterWord),
        "none" => Some(TextJustification::None),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 parser paired with the TextVerticalAlign table
pub fn parse_text_vertical_align(value: &str) -> Option<TextVerticalAlign> {
    return match value {
        "bottom" => Some(TextVerticalAlign::Bottom),
        "middle" => Some(TextVerticalAlign::Middle),
        "top" => Some(TextVerticalAlign::Top),
        _ => None,
    };
}
