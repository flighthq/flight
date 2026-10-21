use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_font::GlyphMetrics;
use flight_glyphatlas::GlyphEntry;
use flight_textureatlas::TextureAtlas;

/// Pixel encoding carried by a static bitmap font.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BitmapFontEncoding {
    Msdf,
    #[default]
    Raster,
    Sdf,
}

/// Why one bitmap-font glyph will not render, or `Ok` when it will.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitmapFontGlyphExplanationReason {
    EmptyGlyph,
    NoGlyph,
    NoPages,
    Ok,
}

/// Source-data repair reported by the optional bitmap-font guard.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitmapFontGuardReason {
    PageOutOfRange,
}

/// Once-only logging keys owned by the bitmap-font guard adapter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitmapFontGuardLogKey {
    PageOutOfRange,
}

/// Immutable static bitmap-font entity. Lookup maps own shared entry records, while pages and metrics
/// retain the exact authored identities selected during initialization.
// flight-lint: allow(contract-vocabulary) D9: kerning keys need exact 64-bit Unicode-pair arithmetic
pub struct BitmapFont {
    runtime: EntityRuntimeSlot,
    pub encoding: BitmapFontEncoding,
    pub glyphs: HashMap<u32, Ref<GlyphEntry>>,
    pub kerning: HashMap<u64, f32>,
    pub metrics: Arc<GlyphMetrics>,
    pub pages: Vec<Ref<TextureAtlas>>,
    pub(crate) glyph_order: Vec<u32>,
}

/// Plain construction input for a static font.
#[derive(Clone)]
pub struct BitmapFontData {
    pub encoding: Option<BitmapFontEncoding>,
    pub glyphs: Vec<BitmapFontGlyphData>,
    pub kerning: Option<Vec<BitmapFontKerningData>>,
    pub metrics: Arc<GlyphMetrics>,
    pub pages: Vec<Ref<TextureAtlas>>,
}

/// One authored glyph plus its Unicode codepoint.
#[derive(Clone, Debug, PartialEq)]
pub struct BitmapFontGlyphData {
    pub advance: f32,
    pub bearing_x: i32,
    pub bearing_y: i32,
    pub codepoint: u32,
    pub height: u32,
    pub page: Option<i32>,
    pub width: u32,
    pub x: u32,
    pub y: u32,
}

/// One authored kerning adjustment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BitmapFontKerningData {
    pub amount: f32,
    pub left: u32,
    pub right: u32,
}

/// Out record populated by `unpack_bitmap_font_kerning_key`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BitmapFontKerningPair {
    pub left: u32,
    pub right: u32,
}

/// Pull-style explanation for one codepoint.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BitmapFontGlyphExplanation {
    pub glyph_height: u32,
    pub glyph_width: u32,
    pub page: i32,
    pub page_count: usize,
    pub reason: BitmapFontGlyphExplanationReason,
    pub renderable: bool,
}

/// Size and codepoint-range summary for one font.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BitmapFontSummary {
    pub byte_size: usize,
    pub glyph_count: usize,
    pub kerning_pair_count: usize,
    pub max_codepoint: i32,
    pub min_codepoint: i32,
    pub page_count: usize,
}

/// Optional source-data repair callback.
pub type BitmapFontGuard = Arc<dyn Fn(BitmapFontGuardReason, u32, i32) + Send + Sync>;

/// Caller-owned replacement for the source module's guard slot.
#[derive(Default)]
pub struct BitmapFontGuardState {
    pub guard: Option<BitmapFontGuard>,
}

pub type BitmapFontGuardStateRef = Ref<BitmapFontGuardState>;

/// D5 live clock sampled only when a warning is emitted.
// flight-lint: allow(f64) log operation timestamps use the canonical millisecond f64 lane
pub type BitmapFontClock = Arc<dyn Fn() -> f64 + Send + Sync>;

impl Default for BitmapFont {
    fn default() -> Self {
        return BitmapFont {
            runtime: EntityRuntimeSlot::default(),
            encoding: BitmapFontEncoding::Raster,
            glyphs: HashMap::new(),
            kerning: HashMap::new(),
            metrics: Arc::new(GlyphMetrics::default()),
            pages: Vec::new(),
            glyph_order: Vec::new(),
        };
    }
}

flight_entity::impl_entity!(BitmapFont);
