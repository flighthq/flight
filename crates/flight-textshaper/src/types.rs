//! flight-compiler: string-union TextDirection=exact
//! flight-compiler: string-union-value TextDirection LeftToRight "LeftToRight"
//! flight-compiler: string-union-value TextDirection RightToLeft "RightToLeft"
//! flight-compiler: string-union-value TextDirection TopToBottom "TopToBottom"

use std::any::Any;
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Weak};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_font::FontResource;
use flight_host::ProviderRef;
use flight_signals::Signal;
use flight_textformat::{FontVariation, TextFormat};

/// Small-caps from capitals (TS `TextFeatureCapitals`).
pub const TEXT_FEATURE_CAPITALS: &str = "c2sc";
/// Contextual alternates (TS `TextFeatureContextualAlternates`).
pub const TEXT_FEATURE_CONTEXTUAL_ALTERNATES: &str = "calt";
/// Discretionary ligatures (TS `TextFeatureDiscretionaryLigatures`).
pub const TEXT_FEATURE_DISCRETIONARY_LIGATURES: &str = "dlig";
/// Fractions (TS `TextFeatureFractions`).
pub const TEXT_FEATURE_FRACTIONS: &str = "frac";
/// Kerning (TS `TextFeatureKerning`).
pub const TEXT_FEATURE_KERNING: &str = "kern";
/// Standard ligatures (TS `TextFeatureLigatures`).
pub const TEXT_FEATURE_LIGATURES: &str = "liga";
/// Old-style figures (TS `TextFeatureOldStyleFigures`).
pub const TEXT_FEATURE_OLD_STYLE_FIGURES: &str = "onum";
/// Small capitals (TS `TextFeatureSmallCaps`).
pub const TEXT_FEATURE_SMALL_CAPS: &str = "smcp";
/// Stylistic alternates (TS `TextFeatureStylisticAlternates`).
pub const TEXT_FEATURE_STYLISTIC_ALTERNATES: &str = "salt";
/// Subscript (TS `TextFeatureSubscript`).
pub const TEXT_FEATURE_SUBSCRIPT: &str = "subs";
/// Superscript (TS `TextFeatureSuperscript`).
pub const TEXT_FEATURE_SUPERSCRIPT: &str = "sups";
/// Tabular figures (TS `TextFeatureTabularFigures`).
pub const TEXT_FEATURE_TABULAR_FIGURES: &str = "tnum";

/// Text direction (TS `TextDirection` and its `TextDirection*` constants).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum TextDirection {
    #[default]
    LeftToRight,
    RightToLeft,
    TopToBottom,
}

/// Every operation name on the host shaper (TS `TextShaperOperation = keyof HostTextShaperCapability`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextShaperOperation {
    GetCodePointForGlyph,
    GetFontMetrics,
    GetGlyphExtents,
    GetGlyphIndexForCodePoint,
    GetGlyphName,
    MeasureText,
    ShapeRun,
}

/// Vertical font metrics from the shaping layer, in font design units unless the backend normalizes
/// them (TS `FontMetrics`). Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FontMetrics {
    pub ascent: f32,
    pub cap_height: f32,
    pub descent: f32,
    pub line_gap: f32,
    pub underline_position: f32,
    pub underline_thickness: f32,
    pub units_per_em: f32,
    pub x_height: f32,
}

/// The ink bounding box of one glyph in pixels; the bearings run from the glyph origin to the box's
/// top-left (positive y is down) (TS `GlyphExtents`). Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GlyphExtents {
    pub height: f32,
    pub width: f32,
    pub x_bearing: f32,
    pub y_bearing: f32,
}

/// Run-level shaping hints for `HostTextShaperCapability::shape_run` (TS `ShapeRunOptions`). Plain
/// record.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShapeRunOptions {
    pub direction: Option<TextDirection>,
    pub script: Option<String>,
}

/// One shaped glyph (TS `ShapedGlyph`): its source cluster (a UTF-16 code-unit offset), glyph id,
/// pen advances and drawing offsets. Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ShapedGlyph {
    pub cluster: i32,
    pub glyph_id: i32,
    pub x_advance: f32,
    pub x_offset: f32,
    pub y_advance: f32,
    pub y_offset: f32,
}

/// A shaped run (TS `ShapedRun`, an Entity through `createShapedRun(): ShapedRun & Entity`), shared
/// as `Ref<ShapedRun>` so caches and the run pool keep its identity. `glyph_count` is the valid count;
/// `glyphs` may be over-allocated as a reusable buffer.
pub struct ShapedRun {
    runtime: EntityRuntimeSlot,
    pub advance_width: f32,
    pub direction: TextDirection,
    pub font: Option<Ref<FontResource>>,
    pub glyph_count: usize,
    pub glyphs: Vec<ShapedGlyph>,
    pub script: String,
}

/// One OpenType feature setting over an optional code-unit range (TS `TextFeature`). Plain record.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextFeature {
    pub end: Option<i32>,
    pub start: Option<i32>,
    pub tag: String,
    pub value: i32,
}

/// One itemized run: UTF-16 code-unit `[start, end)`, its ISO 15924 script tag and direction (TS
/// `TextItem`). Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextItem {
    pub direction: TextDirection,
    pub end: usize,
    pub script: String,
    pub start: usize,
}

/// Options for multi-run itemization and shaping (TS `TextShaperOptions`). Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextShaperOptions {
    pub direction: Option<TextDirection>,
    pub features: Option<Vec<TextFeature>>,
    pub language: Option<String>,
    pub script: Option<String>,
    pub variations: Option<Vec<FontVariation>>,
}

/// The horizontal advance, in pixels, of `text` in `format` (TS `TextMeasureFunction`).
pub type TextMeasureFunction = Arc<dyn Fn(&str, &TextFormat) -> f32 + Send + Sync>;

/// The host text shaper (TS `HostTextShaperCapability`). `measure_text` is required; every other
/// member is optional, `None` being a host that does not provide it (an advances-only canvas host
/// provides only `measure_text`).
#[derive(Clone)]
pub struct HostTextShaperCapability {
    pub provider: ProviderRef,
    pub get_code_point_for_glyph: Option<Arc<dyn Fn(i32) -> i32 + Send + Sync>>,
    pub get_font_metrics: Option<Arc<dyn Fn(&TextFormat) -> Option<FontMetrics> + Send + Sync>>,
    pub get_glyph_extents: Option<Arc<dyn Fn(i32) -> Option<GlyphExtents> + Send + Sync>>,
    pub get_glyph_index_for_code_point: Option<Arc<dyn Fn(i32) -> i32 + Send + Sync>>,
    pub get_glyph_name: Option<Arc<dyn Fn(i32) -> String + Send + Sync>>,
    pub measure_text: TextMeasureFunction,
    pub shape_run: Option<
        Arc<dyn Fn(&str, &TextFormat, Option<&ShapeRunOptions>) -> Ref<ShapedRun> + Send + Sync>,
    >,
}

/// Host text-shaper capability group (TS `HostTextShaperCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostTextShaperCapabilities {
    pub shaper: Option<HostTextShaperCapability>,
}

/// A shaped-run cache (TS `TextShaperCache extends Entity`, an opaque handle). The private state is
/// the source's runtime-slot payload: the entries (`None` once disposed) and the backend ids that
/// scope keys by host provider identity, held weakly so a dropped provider is not retained.
pub struct TextShaperCache {
    runtime: EntityRuntimeSlot,
    pub(crate) backends: Vec<(Weak<dyn Any + Send + Sync>, u64)>,
    pub(crate) entries: Option<HashMap<String, Ref<ShapedRun>>>,
    pub(crate) next_backend_id: u64,
}

/// The text-shaper signals entity (TS `TextShaperSignals extends Entity`).
pub struct TextShaperSignals {
    runtime: EntityRuntimeSlot,
    pub on_backend_changed: Signal<Option<HostTextShaperCapability>>,
}

/// The pool's double-release diagnostics hook.
pub type ShapedRunReleaseGuard = Arc<dyn Fn(&Ref<ShapedRun>) + Send + Sync>;

/// Caller-owned shaped-run pool replacing the source module pool, membership mirror and release
/// guard slot (D5). Holds at most 64 runs; each pooled run appears once.
#[derive(Clone, Default)]
pub struct ShapedRunPool {
    pub(crate) pool: Vec<Ref<ShapedRun>>,
    pub(crate) release_guard: Option<ShapedRunReleaseGuard>,
}

/// Caller-owned slot replacing the source module's signals singleton (D5): `None` until enabled.
#[derive(Clone, Default)]
pub struct TextShaperSignalsState {
    pub(crate) signals: Option<Ref<TextShaperSignals>>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_shaped_run sets the source defaults
impl Default for ShapedRun {
    fn default() -> Self {
        return ShapedRun {
            runtime: EntityRuntimeSlot::default(),
            advance_width: 0.0,
            direction: TextDirection::LeftToRight,
            font: None,
            glyph_count: 0,
            glyphs: Vec::new(),
            script: String::new(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_text_shaper_cache sets the source state
impl Default for TextShaperCache {
    fn default() -> Self {
        return TextShaperCache {
            runtime: EntityRuntimeSlot::default(),
            backends: Vec::new(),
            entries: None,
            next_backend_id: 1,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_text_shaper_signals creates the signal
impl Default for TextShaperSignals {
    fn default() -> Self {
        return TextShaperSignals {
            runtime: EntityRuntimeSlot::default(),
            on_backend_changed: Signal::default(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the font is a shared handle without Debug, so Debug reports whether one is set
impl fmt::Debug for ShapedRun {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ShapedRun")
            .field("advance_width", &self.advance_width)
            .field("direction", &self.direction)
            .field("font", &self.font.is_some())
            .field("glyph_count", &self.glyph_count)
            .field("glyphs", &self.glyphs)
            .field("script", &self.script)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the cache's runtime payload holds handles, so Debug reports its entry count and disposal
impl fmt::Debug for TextShaperCache {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("TextShaperCache")
            .field("entries", &self.entries.as_ref().map(HashMap::len))
            .finish();
    }
}

flight_entity::impl_entity!(ShapedRun);
flight_entity::impl_entity!(TextShaperCache);
flight_entity::impl_entity!(TextShaperSignals);
