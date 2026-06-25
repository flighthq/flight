use crate::font_metrics::FontMetrics;
use crate::glyph_extents::GlyphExtents;
use crate::shaped_run::{ShapeDirection, ShapedRun};

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

/// Base writing direction. Resolves the direction-relative `Start`/`End`
/// alignment aliases during layout.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextDirection {
    #[default]
    Ltr,
    Rtl,
}

/// Inter-word justification mode. `None` disables justification entirely;
/// `InterWord` distributes residual width across the spaces between words.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextJustification {
    #[default]
    InterWord,
    None,
}

/// The glyph drawn at the start of a bulleted paragraph. `None` suppresses the
/// marker glyph while keeping the paragraph indent; the default is the filled
/// `Disc` bullet. Mirrors the TS `TextFormatListMarker`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextFormatListMarker {
    Circle,
    Decimal,
    #[default]
    Disc,
    None,
    Square,
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
    pub list_marker: Option<TextFormatListMarker>,
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

/// Options passed to `TextShaperBackend::shape_run` for run-level shaping hints.
#[derive(Clone, Debug, Default)]
pub struct ShapeRunOptions {
    pub direction: Option<ShapeDirection>,
    pub script: Option<String>,
}

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
///
/// The glyph/metrics methods and `shape_run` are the richer-backend (HarfBuzz) surface; the
/// advances-only canvas backend leaves them at their default sentinels. Mirrors the TS optional
/// `TextShaperBackend` members (`getCodePointForGlyph`, `getFontMetrics`, `getGlyphExtents`,
/// `getGlyphIndexForCodePoint`, `getGlyphName`, `shapeRun`).
pub trait TextShaperBackend: Send + Sync {
    /// Returns the unicode code point that produced `glyph_id`, or `-1` if unknown. Reverse map of
    /// `get_glyph_index_for_code_point`; useful for hit-testing and accessibility.
    fn get_code_point_for_glyph(&self, _glyph_id: u32) -> i32 {
        -1
    }

    /// Returns font-level metrics (ascent, descent, units_per_em, etc.) for the given format, or
    /// `None` if the backend cannot provide them.
    fn get_font_metrics(&self, _format: &TextFormat) -> Option<FontMetrics> {
        None
    }

    /// Returns the ink bounding box for a single glyph, or `None` if the glyph is unknown or the
    /// backend does not support per-glyph extents.
    fn get_glyph_extents(&self, _glyph_id: u32) -> Option<GlyphExtents> {
        None
    }

    /// Returns the glyph index for a unicode code point, or `-1` if the font has no glyph for it.
    fn get_glyph_index_for_code_point(&self, _code_point: u32) -> i32 {
        -1
    }

    /// Returns the PostScript name for a glyph, or an empty string if the backend cannot name it.
    fn get_glyph_name(&self, _glyph_id: u32) -> String {
        String::new()
    }

    /// Returns the horizontal advance width, in pixels, of `text` rendered in `format`. Identical
    /// in shape to `TextMeasureFunction`; text-layout calls this once per character (and per
    /// adjacent pair, to recover kerning) to build per-character advance positions.
    fn measure_text(&self, text: &str, format: &TextFormat) -> f32;

    /// Shapes a text run — applies font features, bidi, and cluster mapping — returning a
    /// `ShapedRun` with per-glyph ids, advances, and offsets. Only richer backends (HarfBuzz)
    /// implement this; the advances-only canvas backend returns `None`.
    fn shape_run(
        &self,
        _text: &str,
        _format: &TextFormat,
        _options: Option<&ShapeRunOptions>,
    ) -> Option<ShapedRun> {
        None
    }
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
    /// Base writing direction. `None` defaults to `Ltr`.
    pub direction: Option<TextDirection>,
    pub format_ranges: Vec<TextFormatRange>,
    pub height: f32,
    /// Inter-word justification mode. `None` defaults to `InterWord`.
    pub justification: Option<TextJustification>,
    /// Maximum line count before truncation; `None` (or a negative value)
    /// means unlimited.
    pub max_lines: Option<i32>,
    pub multiline: bool,
    pub text: String,
    /// Character appended when text is truncated by `max_lines`. `None`
    /// defaults to the ellipsis `…`.
    pub truncation_character: Option<String>,
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
    pub caret_color: u32,
    pub caret_index: usize,
    pub caret_width: f32,
    /// The desired-x column for continuous vertical navigation. `-1.0` (unset)
    /// until the first up/down keystroke anchors it to the caret's pixel x.
    pub desired_caret_x: f32,
    pub display_as_password: bool,
    pub focused: bool,
    /// The undo/redo edit history (oldest first).
    pub history: Vec<TextInputHistoryEntry>,
    /// Cursor into `history`: index of the most-recent applied record, or `-1`
    /// when no edit is recorded (or all have been undone past the first).
    pub history_index: i64,
    /// Maximum number of retained history records. `0` disables history.
    pub history_limit: usize,
    pub password_character: char,
    pub restrict: String,
    pub selection_alpha: f32,
    pub selection_color: u32,
    pub selection_index: usize,
}

/// One recorded edit in a field's undo/redo history: the before/after text and
/// caret/selection snapshots of one edit, plus the optional `merge_kind` used to
/// coalesce a run of same-kind keystrokes into one undo step (a `None` kind never
/// merges). Mirrors the TS `TextInputHistoryEntry`.
#[derive(Clone, Debug, Default)]
pub struct TextInputHistoryEntry {
    pub caret_index_after: usize,
    pub caret_index_before: usize,
    pub merge_kind: Option<String>,
    pub selection_index_after: usize,
    pub selection_index_before: usize,
    pub text_after: String,
    pub text_before: String,
}

/// Options for `enable_text_input`.
#[derive(Clone, Debug, Default)]
pub struct TextInputOptions {
    pub always_show_selection: Option<bool>,
    pub caret_color: Option<u32>,
    pub caret_width: Option<f32>,
    pub display_as_password: Option<bool>,
    pub history_limit: Option<usize>,
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
    /// The current layout, required to resolve vertical caret motion (up/down).
    pub layout: Option<TextLayoutResult>,
    pub on_copy: Option<Box<dyn Fn(String) + Send + Sync>>,
}

impl std::fmt::Debug for HandleTextInputKeyboardOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HandleTextInputKeyboardOptions")
            .field("clipboard_text", &self.clipboard_text)
            .field("layout", &self.layout)
            .field("on_copy", &self.on_copy.as_ref().map(|_| "<fn>"))
            .finish()
    }
}

/// Options for replacing a text selection.
#[derive(Clone, Debug, Default)]
pub struct ReplaceTextInputOptions {
    pub apply_input_rules: bool,
    /// When set, coalesces consecutive edits sharing the same kind into one
    /// undo step; `None` records a discrete, non-merging edit.
    pub merge_kind: Option<String>,
    /// When `true`, the edit is applied without recording a history entry.
    pub skip_history: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AdvancesOnlyBackend;

    impl TextShaperBackend for AdvancesOnlyBackend {
        fn measure_text(&self, text: &str, _format: &TextFormat) -> f32 {
            text.chars().count() as f32
        }
    }

    #[test]
    fn text_shaper_backend_optional_methods_default_to_sentinels() {
        let backend = AdvancesOnlyBackend;
        let format = TextFormat::default();

        // measure_text is the one required method.
        assert_eq!(backend.measure_text("abcd", &format), 4.0);

        // The richer-backend surface defaults to sentinels for an advances-only backend.
        assert_eq!(backend.get_code_point_for_glyph(7), -1);
        assert_eq!(backend.get_glyph_index_for_code_point(0x41), -1);
        assert_eq!(backend.get_glyph_name(7), "");
        assert_eq!(backend.get_font_metrics(&format), None);
        assert_eq!(backend.get_glyph_extents(7), None);
        assert!(backend.shape_run("abc", &format, None).is_none());
    }

    #[test]
    fn shape_run_options_default_is_empty() {
        let options = ShapeRunOptions::default();
        assert_eq!(options.direction, None);
        assert_eq!(options.script, None);
    }

    #[test]
    fn text_format_list_marker_default_is_disc() {
        // Mirrors the TS default: an absent listMarker is the filled disc bullet.
        assert_eq!(TextFormatListMarker::default(), TextFormatListMarker::Disc);
    }

    #[test]
    fn text_input_history_entry_default_is_a_null_merge_kind_record() {
        let entry = TextInputHistoryEntry::default();
        assert_eq!(entry.merge_kind, None);
        assert_eq!(entry.text_before, "");
        assert_eq!(entry.text_after, "");
    }
}
