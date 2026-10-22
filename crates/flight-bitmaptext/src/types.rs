//! BitmapText-owned declarations from the pinned `BitmapText.ts` and diagnostics seams.

use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Float32Array, Ref, Uint16Array};
use flight_geometry::Rectangle;
use flight_glyphatlas::GlyphSource;
use flight_scene2d::Node2DFields;
use flight_textureatlas::TextureAtlas;

/// The open node-family kind of a bitmap-text display node (TS `BitmapTextKind`).
pub const BITMAP_TEXT_KIND: &str = "BitmapText";

/// Horizontal line alignment (TS `BitmapTextAlign`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BitmapTextAlign {
    Center,
    Justify,
    #[default]
    Left,
    Right,
}

/// A glyph-source-backed 2D leaf. Its one entity runtime and uid live in the composed
/// `Node2DFields`; kind runtime data is private plain state.
pub struct BitmapText {
    pub(crate) node: Node2DFields,
    pub data: BitmapTextData,
    pub(crate) bitmap_text_runtime: BitmapTextRuntime,
}

/// Mutable bitmap-text data (TS `BitmapTextData extends Node2DData`), therefore an Entity.
pub struct BitmapTextData {
    runtime: EntityRuntimeSlot,
    pub align: BitmapTextAlign,
    pub ellipsis: String,
    pub glyph_source: Option<Ref<GlyphSource>>,
    pub letter_spacing: f32,
    pub line_height: f32,
    pub max_lines: Option<usize>,
    pub text: String,
    pub wrap_width: Option<f32>,
}

/// Authored bitmap-text fields (TS `BitmapTextOptions`). Nested options preserve the difference
/// between an omitted nullable option and an explicit null.
#[derive(Clone, Default)]
pub struct BitmapTextOptions {
    pub align: Option<BitmapTextAlign>,
    pub ellipsis: Option<String>,
    pub letter_spacing: Option<f32>,
    pub line_height: Option<f32>,
    pub max_lines: Option<Option<usize>>,
    pub text: Option<String>,
    pub wrap_width: Option<Option<f32>>,
}

/// One glyph-atlas page's retained typed buffers and page-local texture atlas. This is plain data,
/// not an Entity; `instance_count` is the logical prefix independently of buffer capacity.
pub struct BitmapTextPage {
    pub atlas: Ref<TextureAtlas>,
    pub ids: Box<Uint16Array>,
    pub instance_count: usize,
    pub transforms: Box<Float32Array>,
}

/// BitmapText-specific runtime data past the inherited private Node2D runtime tier. Plain data.
// flight-lint: allow(contract-vocabulary) D0: signed storage covers the -1 sentinel plus the full u32 GlyphSource version range, always within TS safe-integer precision
pub struct BitmapTextRuntime {
    /// `-1` before the first layout; otherwise a canonical GlyphSource `u32` version widened exactly.
    pub glyph_layout_version: i64,
    pub line_count: usize,
    pub local_bounds_rectangle: Option<Rectangle>,
    pub pages: Vec<BitmapTextPage>,
    pub truncated: bool,
}

/// Pull-style missing-glyph inventory (TS `BitmapTextMissingGlyphs`). Plain data.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BitmapTextMissingGlyphs {
    pub missing_codepoints: Vec<u32>,
    pub total_codepoints: usize,
}

/// Reports a bounded layout that could not converge.
pub type BitmapTextLayoutGuard = Arc<dyn Fn(&str, usize) + Send + Sync>;

/// Reports one missing Unicode codepoint during layout.
pub type BitmapTextMissingGlyphGuard = Arc<dyn Fn(u32) + Send + Sync>;

/// Explicit D5 context replacing the source module's two mutable guard slots.
#[derive(Clone, Default)]
pub struct BitmapTextGuardState {
    pub layout_guard: Option<BitmapTextLayoutGuard>,
    pub missing_glyph_guard: Option<BitmapTextMissingGlyphGuard>,
}

/// D5 live clock sampled only when a diagnostic is emitted.
// flight-lint: allow(f64) log operation timestamps use the canonical millisecond f64 lane
pub type BitmapTextClock = Arc<dyn Fn() -> f64 + Send + Sync>;

impl Default for BitmapText {
    fn default() -> Self {
        return BitmapText {
            node: Node2DFields::default(),
            data: BitmapTextData::default(),
            bitmap_text_runtime: BitmapTextRuntime::default(),
        };
    }
}

impl Default for BitmapTextData {
    fn default() -> Self {
        return BitmapTextData {
            runtime: EntityRuntimeSlot::default(),
            align: BitmapTextAlign::Left,
            ellipsis: String::new(),
            glyph_source: None,
            letter_spacing: 0.0,
            line_height: 1.0,
            max_lines: None,
            text: String::new(),
            wrap_width: None,
        };
    }
}

impl Default for BitmapTextRuntime {
    fn default() -> Self {
        return BitmapTextRuntime {
            glyph_layout_version: -1,
            line_count: 0,
            local_bounds_rectangle: None,
            pages: Vec::new(),
            truncated: false,
        };
    }
}

flight_scene2d::impl_node2d!(BitmapText);
flight_entity::impl_entity!(BitmapTextData);
