use flight_entity::{EntityRuntimeSlot, Ref};
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textshaper::{TextDirection, TextMeasureFunction};

#[derive(Clone, Debug, Default)]
pub struct RichTextContent {
    runtime: EntityRuntimeSlot,
    pub format_ranges: Vec<TextFormatRange>,
    pub text: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum TextAutoSize {
    Center,
    Left,
    #[default]
    None,
    Right,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextBoundsSpec {
    pub auto_size: TextAutoSize,
    pub height: f32,
    pub width: f32,
    pub word_wrap: Option<bool>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum TextJustification {
    InterCharacter,
    #[default]
    InterWord,
    None,
}

#[derive(Clone, Debug)]
pub struct TextLayoutGroup {
    runtime: EntityRuntimeSlot,
    pub ascent: f32,
    pub descent: f32,
    pub end_index: usize,
    pub format: Ref<TextFormat>,
    pub height: f32,
    pub leading: f32,
    pub line_index: usize,
    pub offset_x: f32,
    pub offset_y: f32,
    pub positions: Vec<f32>,
    pub start_index: usize,
    pub width: f32,
}

#[derive(Clone)]
pub struct TextLayoutMeasureState {
    pub(crate) measure_provider: Option<TextMeasureFunction>,
}

#[derive(Clone)]
pub struct TextLayoutParams {
    pub auto_size: Option<TextAutoSize>,
    pub border: Option<bool>,
    pub direction: Option<TextDirection>,
    pub format_ranges: Vec<TextFormatRange>,
    pub height: f32,
    pub justification: Option<TextJustification>,
    pub max_lines: Option<i32>,
    pub measure: TextMeasureFunction,
    pub multiline: Option<bool>,
    pub text: String,
    pub truncation_character: Option<String>,
    pub vertical_align: Option<TextVerticalAlign>,
    pub width: f32,
    pub word_wrap: Option<bool>,
}

#[derive(Clone, Debug, Default)]
pub struct TextLayoutResult {
    runtime: EntityRuntimeSlot,
    pub groups: Vec<TextLayoutGroup>,
    pub line_ascents: Vec<f32>,
    pub line_descents: Vec<f32>,
    pub line_heights: Vec<f32>,
    pub line_leadings: Vec<f32>,
    pub line_widths: Vec<f32>,
    pub num_lines: usize,
    pub text_height: f32,
    pub text_width: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TextLineMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub height: f32,
    pub leading: f32,
    pub width: f32,
    pub x: f32,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextMetrics {
    runtime: EntityRuntimeSlot,
    pub height: f32,
    pub num_lines: usize,
    pub width: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TextSelectionRectangle {
    pub height: f32,
    pub line_index: usize,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum TextVerticalAlign {
    Bottom,
    Middle,
    #[default]
    Top,
}

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

impl Default for TextBoundsSpec {
    fn default() -> Self {
        return TextBoundsSpec {
            auto_size: TextAutoSize::None,
            height: 0.0,
            width: 0.0,
            word_wrap: None,
        };
    }
}

impl Default for TextLayoutGroup {
    fn default() -> Self {
        return TextLayoutGroup {
            runtime: EntityRuntimeSlot::default(),
            ascent: 0.0,
            descent: 0.0,
            end_index: 0,
            format: std::sync::Arc::new(std::sync::RwLock::new(TextFormat::default())),
            height: 0.0,
            leading: 0.0,
            line_index: 0,
            offset_x: 0.0,
            offset_y: 0.0,
            positions: Vec::new(),
            start_index: 0,
            width: 0.0,
        };
    }
}

impl Default for TextLayoutMeasureState {
    fn default() -> Self {
        return TextLayoutMeasureState {
            measure_provider: None,
        };
    }
}

flight_entity::impl_entity!(RichTextContent);
flight_entity::impl_entity!(TextLayoutGroup);
flight_entity::impl_entity!(TextLayoutResult);
flight_entity::impl_entity!(TextMetrics);
