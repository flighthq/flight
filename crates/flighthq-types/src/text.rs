// ---------------------------------------------------------------------------
// TextFormat
// ---------------------------------------------------------------------------

/// Horizontal text alignment.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextFormatAlign {
    Center,
    End,
    Justify,
    #[default]
    Left,
    Right,
    Start,
}

/// All text styling properties. All fields are optional; absent fields inherit
/// from the enclosing context or the field's default.
#[derive(Clone, Debug, Default)]
pub struct TextFormat {
    pub align: Option<TextFormatAlign>,
    pub block_indent: Option<f32>,
    pub bold: Option<bool>,
    pub bullet: Option<bool>,
    /// Packed RGBA color, e.g. `0x000000ff`.
    pub color: Option<u32>,
    pub font: Option<String>,
    pub indent: Option<f32>,
    pub italic: Option<bool>,
    pub kerning: Option<bool>,
    pub leading: Option<f32>,
    pub left_margin: Option<f32>,
    pub letter_spacing: Option<f32>,
    pub right_margin: Option<f32>,
    pub size: Option<f32>,
    pub strikethrough: Option<bool>,
    pub tab_stops: Option<Vec<f32>>,
    pub target: Option<String>,
    pub underline: Option<bool>,
    pub url: Option<String>,
}

// ---------------------------------------------------------------------------
// TextFormatRange
// ---------------------------------------------------------------------------

/// A run of text with a specific `TextFormat` applied.
#[derive(Clone, Debug)]
pub struct TextFormatRange {
    pub end: usize,
    pub format: TextFormat,
    pub start: usize,
}

// ---------------------------------------------------------------------------
// TextAutoSize
// ---------------------------------------------------------------------------

/// Controls how a text field resizes to fit its content.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextAutoSize {
    Center,
    Left,
    #[default]
    None,
    Right,
}

// ---------------------------------------------------------------------------
// TextLayout
// ---------------------------------------------------------------------------

/// Measure a text run: returns the advance width in pixels.
pub type TextMeasureFunction = Box<dyn Fn(&str, &TextFormat) -> f32 + Send + Sync>;

/// Text-shaping seam backend. Free functions in `flighthq-textshaper` delegate to the active
/// `TextShaperBackend` (a canvas/advances-only backend on the web, a future HarfBuzz/rustybuzz
/// backend on native). Shaping turns a string + format into the horizontal advance the layout
/// engine needs to place text.
///
/// This formalizes the `TextMeasureFunction` contract as a swappable backend: `measure_text` has
/// the exact signature of a `TextMeasureFunction`. Today shaping is advances-only (no clusters,
/// bidi, or font features) — what canvas `measureText` provides and what text-layout consumes. A
/// richer backend implements the same `measure_text` and may add cluster/glyph methods later
/// without breaking advances-only callers.
pub trait TextShaperBackend: Send + Sync {
    /// Returns the horizontal advance width, in pixels, of `text` rendered in `format`. Identical
    /// in shape to `TextMeasureFunction`; text-layout calls this once per character (and per
    /// adjacent pair, to recover kerning) to build per-character advance positions.
    fn measure_text(&self, text: &str, format: &TextFormat) -> f32;
}

/// A single glyph/word group within a laid-out line.
#[derive(Clone, Debug)]
pub struct TextLayoutGroup {
    pub ascent: f32,
    pub descent: f32,
    pub end_index: usize,
    pub format: TextFormat,
    pub height: f32,
    pub leading: f32,
    pub line_index: usize,
    pub offset_x: f32,
    pub offset_y: f32,
    /// Per-character advance widths in pixels.
    pub positions: Vec<f32>,
    pub start_index: usize,
    pub width: f32,
}

/// Parameters fed to the layout engine.
#[derive(Clone, Debug, Default)]
pub struct TextLayoutParams {
    pub auto_size: Option<TextAutoSize>,
    pub border: bool,
    pub format_ranges: Vec<TextFormatRange>,
    pub height: f32,
    pub multiline: bool,
    pub text: String,
    pub width: f32,
    pub word_wrap: bool,
}

/// Output of the layout engine.
#[derive(Clone, Debug, Default)]
pub struct TextLayoutResult {
    pub groups: Vec<TextLayoutGroup>,
    pub line_ascents: Vec<f32>,
    pub line_descents: Vec<f32>,
    pub line_heights: Vec<f32>,
    pub line_leadings: Vec<f32>,
    pub line_widths: Vec<f32>,
    pub num_lines: u32,
    pub text_height: f32,
    pub text_width: f32,
}

// ---------------------------------------------------------------------------
// TextLineMetrics / TextMetrics
// ---------------------------------------------------------------------------

/// Metrics for a single text line.
#[derive(Copy, Clone, Debug, Default)]
pub struct TextLineMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub height: f32,
    pub leading: f32,
    pub width: f32,
    pub x: f32,
}

/// Measured size of a text field's rendered content (glyph extent).
#[derive(Copy, Clone, Debug, Default)]
pub struct TextMetrics {
    pub width: f32,
    pub height: f32,
    pub num_lines: u32,
}

// ---------------------------------------------------------------------------
// TextSelectionRange / TextSelectionRectangle
// ---------------------------------------------------------------------------

/// A range of selected text.
#[derive(Clone, Debug, Default)]
pub struct TextSelectionRange {
    pub length: usize,
    pub start: usize,
    pub text: String,
}

/// The bounding rectangle of a selection highlight within a text field.
#[derive(Copy, Clone, Debug, Default)]
pub struct TextSelectionRectangle {
    pub height: f32,
    pub line_index: u32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

// ---------------------------------------------------------------------------
// TextLabelData
// ---------------------------------------------------------------------------

/// Data payload for a `TextLabel` display object.
#[derive(Clone, Debug, Default)]
pub struct TextLabelData {
    pub auto_size: TextAutoSize,
    pub height: f32,
    pub text: String,
    pub text_format: TextFormat,
    pub width: f32,
}

// ---------------------------------------------------------------------------
// RichTextData / RichTextContent / RichTextStyleSheet
// ---------------------------------------------------------------------------

/// `RichText` data payload (extends `TextLabelData`).
#[derive(Clone, Debug, Default)]
pub struct RichTextData {
    pub auto_size: TextAutoSize,
    pub background: bool,
    pub background_color: u32,
    pub border: bool,
    pub border_color: u32,
    pub condense_white: bool,
    pub default_text_format: TextFormat,
    pub height: f32,
    pub html_text: String,
    pub max_chars: u32,
    pub mouse_wheel_enabled: bool,
    pub multiline: bool,
    pub scroll_h: f32,
    pub scroll_v: f32,
    pub selectable: bool,
    pub style_sheet: Option<RichTextStyleSheet>,
    pub text: String,
    pub text_color: u32,
    pub text_format_ranges: Vec<TextFormatRange>,
    pub width: f32,
    pub word_wrap: bool,
}

/// Parsed content of an HTML text field.
#[derive(Clone, Debug, Default)]
pub struct RichTextContent {
    pub format_ranges: Vec<TextFormatRange>,
    pub text: String,
}

/// CSS-like style map for `RichText`.
pub type RichTextStyleSheet = std::collections::HashMap<String, TextFormat>;

// ---------------------------------------------------------------------------
// NativeTextStyle / NativeTextData
// ---------------------------------------------------------------------------

/// A platform text style descriptor for `NativeText`.
#[derive(Clone, Debug, Default)]
pub struct NativeTextStyle {
    pub align: Option<TextFormatAlign>,
    pub bold: Option<bool>,
    pub color: Option<u32>,
    pub font: Option<String>,
    pub italic: Option<bool>,
    pub leading: Option<f32>,
    pub size: Option<f32>,
}

/// Data payload for a `NativeText` display object.
#[derive(Clone, Debug, Default)]
pub struct NativeTextData {
    pub auto_size: TextAutoSize,
    pub height: f32,
    pub style: NativeTextStyle,
    pub text: String,
    pub width: f32,
}

// ---------------------------------------------------------------------------
// TextInputState / TextInputOptions
// ---------------------------------------------------------------------------

/// Opt-in editable-field state attached to a `RichText` by `enable_text_input`.
#[derive(Clone, Debug, Default)]
pub struct TextInputState {
    pub always_show_selection: bool,
    pub caret_index: usize,
    pub display_as_password: bool,
    pub focused: bool,
    pub password_character: char,
    pub restrict: String,
    pub selection_alpha: f32,
    pub selection_color: u32,
    pub selection_index: usize,
}

/// Options for `enable_text_input`.
#[derive(Clone, Debug, Default)]
pub struct TextInputOptions {
    pub always_show_selection: Option<bool>,
    pub display_as_password: Option<bool>,
    pub password_character: Option<char>,
    pub restrict: Option<String>,
    pub selection_alpha: Option<f32>,
    pub selection_color: Option<u32>,
}

// ---------------------------------------------------------------------------
// TextInputManager / SelectableRichTextManager
// ---------------------------------------------------------------------------

/// Manages the currently focused text input field.
#[derive(Debug, Default)]
pub struct TextInputManager {
    pub enabled: bool,
    /// The focused `RichText` node id, or `None` when no field is focused.
    pub focused_id: Option<u64>,
}

/// Manages the currently focused selectable rich text field.
#[derive(Debug, Default)]
pub struct SelectableRichTextManager {
    /// The focused `RichText` node id, or `None`.
    pub focused_id: Option<u64>,
}

// ---------------------------------------------------------------------------
// TextInputEditingOptions
// ---------------------------------------------------------------------------

/// Options for handling a keyboard event during text input.
#[derive(Default)]
pub struct HandleTextInputKeyboardOptions {
    pub clipboard_text: Option<String>,
    pub on_copy: Option<Box<dyn Fn(String) + Send + Sync>>,
}

impl std::fmt::Debug for HandleTextInputKeyboardOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HandleTextInputKeyboardOptions")
            .field("clipboard_text", &self.clipboard_text)
            .field("on_copy", &self.on_copy.as_ref().map(|_| "<fn>"))
            .finish()
    }
}

/// Options for replacing a text selection.
#[derive(Clone, Debug, Default)]
pub struct ReplaceTextInputOptions {
    pub apply_input_rules: bool,
}
