use crate::FontVariation;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextFormatAlign {
    Center,
    End,
    Justify,
    Left,
    Right,
    Start,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextFormatListMarker {
    Circle,
    Decimal,
    Disc,
    None,
    Square,
}

/// Source optional fields remain absent until a later layout consumer applies defaults.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextFormat {
    pub align: Option<TextFormatAlign>,
    pub block_indent: Option<f32>,
    pub bold: Option<bool>,
    pub bullet: Option<bool>,
    /// Packed sRGB RGBA integer, 0xRRGGBBAA; alpha is linear coverage.
    pub color: Option<u32>,
    pub font: Option<String>,
    pub indent: Option<f32>,
    pub italic: Option<bool>,
    pub kerning: Option<bool>,
    pub leading: Option<f32>,
    pub left_margin: Option<f32>,
    pub letter_spacing: Option<f32>,
    pub list_marker: Option<TextFormatListMarker>,
    pub right_margin: Option<f32>,
    pub size: Option<f32>,
    pub strikethrough: Option<bool>,
    /// Plain source number[], preserving its variable length and order.
    pub tab_stops: Option<Vec<f32>>,
    pub target: Option<String>,
    pub underline: Option<bool>,
    pub url: Option<String>,
    /// Readonly source record sequence, preserving order and repeated axis tags.
    pub variations: Option<Vec<FontVariation>>,
}

// flight-lint: allow(conform-extra) D9 exact string table for types/TextFormat.ts TextFormatAlign; no source helper function exists
pub fn get_text_format_align_string(value: TextFormatAlign) -> &'static str {
    return match value {
        TextFormatAlign::Center => "center",
        TextFormatAlign::End => "end",
        TextFormatAlign::Justify => "justify",
        TextFormatAlign::Left => "left",
        TextFormatAlign::Right => "right",
        TextFormatAlign::Start => "start",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/TextFormat.ts TextFormatListMarker; no source helper function exists
pub fn get_text_format_list_marker_string(value: TextFormatListMarker) -> &'static str {
    return match value {
        TextFormatListMarker::Circle => "circle",
        TextFormatListMarker::Decimal => "decimal",
        TextFormatListMarker::Disc => "disc",
        TextFormatListMarker::None => "none",
        TextFormatListMarker::Square => "square",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/TextFormat.ts TextFormatAlign; no source helper function exists
pub fn parse_text_format_align(value: &str) -> Option<TextFormatAlign> {
    return match value {
        "center" => Some(TextFormatAlign::Center),
        "end" => Some(TextFormatAlign::End),
        "justify" => Some(TextFormatAlign::Justify),
        "left" => Some(TextFormatAlign::Left),
        "right" => Some(TextFormatAlign::Right),
        "start" => Some(TextFormatAlign::Start),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/TextFormat.ts TextFormatListMarker; no source helper function exists
pub fn parse_text_format_list_marker(value: &str) -> Option<TextFormatListMarker> {
    return match value {
        "circle" => Some(TextFormatListMarker::Circle),
        "decimal" => Some(TextFormatListMarker::Decimal),
        "disc" => Some(TextFormatListMarker::Disc),
        "none" => Some(TextFormatListMarker::None),
        "square" => Some(TextFormatListMarker::Square),
        _ => None,
    };
}
