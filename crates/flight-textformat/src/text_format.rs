//! flight-compiler: string-union TextFormatAlign TextFormatListMarker

use std::sync::Arc;

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
    pub variations: Option<Arc<Vec<FontVariation>>>,
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

pub fn get_text_format_ascent(format: &TextFormat) -> f32 {
    return format.size.unwrap_or(DEFAULT_SIZE);
}

pub fn get_text_format_descent(format: &TextFormat) -> f32 {
    return format.size.unwrap_or(DEFAULT_SIZE) * 0.185;
}

pub fn get_text_format_height(format: &TextFormat) -> f32 {
    return get_text_format_ascent(format)
        + get_text_format_descent(format)
        + get_text_format_leading(format);
}

pub fn get_text_format_leading(format: &TextFormat) -> f32 {
    return format.leading.unwrap_or(0.0);
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

pub fn merge_text_format(base: &TextFormat, r#override: &TextFormat) -> TextFormat {
    let mut result = base.clone();
    if r#override.align.is_some() {
        result.align = r#override.align;
    }
    if r#override.block_indent.is_some() {
        result.block_indent = r#override.block_indent;
    }
    if r#override.bold.is_some() {
        result.bold = r#override.bold;
    }
    if r#override.bullet.is_some() {
        result.bullet = r#override.bullet;
    }
    if r#override.color.is_some() {
        result.color = r#override.color;
    }
    if r#override.font.is_some() {
        result.font = r#override.font.clone();
    }
    if r#override.indent.is_some() {
        result.indent = r#override.indent;
    }
    if r#override.italic.is_some() {
        result.italic = r#override.italic;
    }
    if r#override.kerning.is_some() {
        result.kerning = r#override.kerning;
    }
    if r#override.leading.is_some() {
        result.leading = r#override.leading;
    }
    if r#override.left_margin.is_some() {
        result.left_margin = r#override.left_margin;
    }
    if r#override.letter_spacing.is_some() {
        result.letter_spacing = r#override.letter_spacing;
    }
    if r#override.list_marker.is_some() {
        result.list_marker = r#override.list_marker;
    }
    if r#override.right_margin.is_some() {
        result.right_margin = r#override.right_margin;
    }
    if r#override.size.is_some() {
        result.size = r#override.size;
    }
    if r#override.strikethrough.is_some() {
        result.strikethrough = r#override.strikethrough;
    }
    if r#override.tab_stops.is_some() {
        result.tab_stops = r#override.tab_stops.clone();
    }
    if r#override.target.is_some() {
        result.target = r#override.target.clone();
    }
    if r#override.underline.is_some() {
        result.underline = r#override.underline;
    }
    if r#override.url.is_some() {
        result.url = r#override.url.clone();
    }
    if r#override.variations.is_some() {
        result.variations = r#override.variations.clone();
    }
    return result;
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

const DEFAULT_SIZE: f32 = 12.0;
