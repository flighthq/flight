use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};
use flight_font::{GlyphRasterizeFontWeight, GlyphRasterizeFontWeightString};
use flight_texture::TextureSourceRef;

pub use flight_font::{
    GlyphMetrics, GlyphRasterizeOptions, GlyphRasterizedBitmap, GlyphRasterizerOperation,
    HostGlyphRasterizerCapability,
};

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_entity::Ref;
    use flight_font::{GlyphRasterizedBitmap, HostGlyphRasterizerCapability};

    use crate::contract::*;

    fn atlas() -> Ref<GlyphAtlas> {
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(|_codepoint, _options| {
                return Some(GlyphRasterizedBitmap {
                    advance: 4.0,
                    bearing_x: 0,
                    bearing_y: 4,
                    height: 4,
                    pixels: vec![255; 64].into_boxed_slice(),
                    width: 4,
                });
            }),
        };
        return create_glyph_atlas(&GlyphAtlasOptions {
            font_family: "mock".to_string(),
            font_size: 10.0,
            font_style: None,
            font_weight: None,
            height: 32,
            max_area: None,
            max_bytes: None,
            max_glyphs: None,
            padding: None,
            rasterizer_backend: backend,
            width: 32,
        });
    }

    #[test]
    fn glyph_source_methods_match_their_bound_callbacks() {
        let source = create_glyph_source_from_glyph_atlas(&atlas());
        let source = source.read().unwrap();
        let method_entry = source.glyph_entry(65).unwrap();
        let callback_entry = (source.get_glyph_entry)(65).unwrap();
        assert!(Arc::ptr_eq(&method_entry, &callback_entry));
        let method_image = source.glyph_atlas_image(None).unwrap();
        let callback_image = (source.get_glyph_atlas_image)(None).unwrap();
        assert_eq!(
            Arc::as_ptr(&method_image) as *const (),
            Arc::as_ptr(&callback_image) as *const ()
        );
        assert_eq!(
            source.glyph_kerning(65, 66),
            (source.get_glyph_kerning)(65, 66)
        );
        assert_eq!(
            source.glyph_layout_version(),
            (source.get_glyph_layout_version)()
        );
        assert_eq!(source.glyph_metrics(), (source.get_glyph_metrics)());
    }

    #[test]
    fn glyph_source_methods_work_on_an_initialized_entity() {
        let atlas = atlas();
        let mut source: GlyphSource = flight_entity::allocate_entity();
        initialize_glyph_source_from_glyph_atlas(&mut source, &atlas);
        let source = Arc::new(RwLock::new(source));
        assert!(source.read().unwrap().glyph_entry(65).is_some());
    }
}

/// Construction options for one dynamic glyph atlas. Zero or absent budgets are unbounded.
#[derive(Clone)]
pub struct GlyphAtlasOptions {
    pub font_family: String,
    pub font_size: f32,
    pub font_style: Option<String>,
    pub font_weight: Option<String>,
    pub height: u32,
    pub max_area: Option<usize>,
    pub max_bytes: Option<usize>,
    pub max_glyphs: Option<usize>,
    pub padding: Option<u32>,
    pub rasterizer_backend: HostGlyphRasterizerCapability,
    pub width: u32,
}

/// One row of the incremental shelf packer.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlyphAtlasShelf {
    pub cursor_x: u32,
    pub height: u32,
    pub y: u32,
}

/// One cached glyph's atlas rectangle and pen metrics.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GlyphEntry {
    pub advance: f32,
    pub bearing_x: i32,
    pub bearing_y: i32,
    pub height: u32,
    pub page: u32,
    pub width: u32,
    pub x: u32,
    pub y: u32,
}

/// Pull-style explanation for one glyph-atlas lookup.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlyphAtlasEntryExplanation {
    pub renderable: bool,
    pub reason: GlyphAtlasEntryBlockReason,
    pub glyph_width: u32,
    pub glyph_height: u32,
    pub usable_width: i32,
    pub usable_height: i32,
}

/// Closed reasons returned by `explain_glyph_atlas_entry`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlyphAtlasEntryBlockReason {
    GlyphLargerThanAtlas,
    Ok,
    RasterizerReturnedNull,
}

/// Closed reasons emitted through the opt-in entry guard.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlyphAtlasEntryGuardReason {
    GlyphLargerThanAtlas,
    RasterizerReturnedNull,
    Repack,
    RepackDropped,
}

/// Closed once-only log keys used by glyph-atlas diagnostics.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlyphAtlasGuardLogKey {
    GlyphLargerThanAtlas,
    RasterizerReturnedNull,
    RepackDropped,
    RepackThrashing,
}

/// Typed guard notice. `subject` is a codepoint except for `Repack`, where it is the live count.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlyphAtlasEntryGuardNotice {
    pub reason: GlyphAtlasEntryGuardReason,
    pub subject: u32,
    pub repack_count: u32,
}

pub type GlyphAtlasEntryGuard = Arc<dyn Fn(&GlyphAtlasEntryGuardNotice) + Send + Sync>;

/// D5 injected live clock sampled only when a diagnostic is emitted.
// flight-lint: allow(f64) log operation timestamps use the canonical millisecond f64 lane
pub type GlyphAtlasClock = Arc<dyn Fn() -> f64 + Send + Sync>;

/// Opaque mutable atlas state. Maps are lookup-only; the vectors carry all observable order.
pub struct GlyphAtlasRuntime {
    pub bitmap: Ref<Bitmap>,
    pub bitmaps: HashMap<u32, GlyphRasterizedBitmap>,
    pub dirty: bool,
    pub dirty_max_x: u32,
    pub dirty_max_y: u32,
    pub dirty_min_x: u32,
    pub dirty_min_y: u32,
    pub entries: HashMap<u32, Ref<GlyphEntry>>,
    pub entry_order: Vec<u32>,
    pub layout_version: u32,
    pub lru: Vec<u32>,
    pub max_area: usize,
    pub max_bytes: usize,
    pub max_glyphs: usize,
    pub metrics: GlyphMetrics,
    pub occupied_area: usize,
    pub pack_bottom: u32,
    pub padding: u32,
    pub rasterizer_backend: HostGlyphRasterizerCapability,
    pub rasterize_options: Arc<GlyphRasterizeOptions>,
    pub retained_bytes: usize,
    pub shelves: Vec<GlyphAtlasShelf>,
    pub(crate) entry_guard: Option<GlyphAtlasEntryGuard>,
    pub(crate) guard_repack_count: u32,
}

/// Dynamic glyph-atlas entity. Package state is private behind its shared runtime handle.
pub struct GlyphAtlas {
    runtime: EntityRuntimeSlot,
    pub(crate) atlas_runtime: Ref<GlyphAtlasRuntime>,
}

pub type GlyphSourceGetGlyphAtlasImage =
    Arc<dyn Fn(Option<u32>) -> Option<TextureSourceRef> + Send + Sync>;
pub type GlyphSourceGetGlyphEntry = Arc<dyn Fn(u32) -> Option<Ref<GlyphEntry>> + Send + Sync>;
pub type GlyphSourceGetGlyphKerning = Arc<dyn Fn(u32, u32) -> f32 + Send + Sync>;
pub type GlyphSourceGetGlyphLayoutVersion = Arc<dyn Fn() -> u32 + Send + Sync>;
pub type GlyphSourceGetGlyphMetrics = Arc<dyn Fn() -> GlyphMetrics + Send + Sync>;

/// Runtime-swappable entity seam consumed by text renderers.
pub struct GlyphSource {
    runtime: EntityRuntimeSlot,
    pub get_glyph_atlas_image: GlyphSourceGetGlyphAtlasImage,
    pub get_glyph_entry: GlyphSourceGetGlyphEntry,
    pub get_glyph_kerning: GlyphSourceGetGlyphKerning,
    pub get_glyph_layout_version: GlyphSourceGetGlyphLayoutVersion,
    pub get_glyph_metrics: GlyphSourceGetGlyphMetrics,
}

pub(crate) fn create_glyph_rasterize_options(
    options: &GlyphAtlasOptions,
) -> Arc<GlyphRasterizeOptions> {
    return Arc::new(GlyphRasterizeOptions {
        font_family: options.font_family.clone(),
        font_size: options.font_size,
        font_style: options.font_style.clone(),
        font_weight: options.font_weight.as_ref().map(|value| {
            GlyphRasterizeFontWeight::String(GlyphRasterizeFontWeightString {
                value: value.clone(),
            })
        }),
    });
}

pub(crate) fn allocate_glyph_atlas_entity() -> GlyphAtlas {
    return allocate_entity();
}

pub(crate) fn allocate_glyph_source_entity() -> GlyphSource {
    return allocate_entity();
}

fn call_glyph_source_get_glyph_atlas_image(
    source: &GlyphSource,
    page: Option<u32>,
) -> Option<TextureSourceRef> {
    return (source.get_glyph_atlas_image)(page);
}

fn call_glyph_source_get_glyph_entry(
    source: &GlyphSource,
    codepoint: u32,
) -> Option<Ref<GlyphEntry>> {
    return (source.get_glyph_entry)(codepoint);
}

fn call_glyph_source_get_glyph_kerning(source: &GlyphSource, left: u32, right: u32) -> f32 {
    return (source.get_glyph_kerning)(left, right);
}

fn call_glyph_source_get_glyph_layout_version(source: &GlyphSource) -> u32 {
    return (source.get_glyph_layout_version)();
}

fn call_glyph_source_get_glyph_metrics(source: &GlyphSource) -> GlyphMetrics {
    return (source.get_glyph_metrics)();
}

fn default_rasterizer_backend() -> HostGlyphRasterizerCapability {
    return HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(|_codepoint, _options| None),
    };
}

pub(crate) fn get_glyph_atlas_runtime(atlas: &Ref<GlyphAtlas>) -> Ref<GlyphAtlasRuntime> {
    return atlas.read().unwrap().atlas_runtime.clone();
}

impl Default for GlyphAtlasRuntime {
    fn default() -> Self {
        return GlyphAtlasRuntime {
            bitmap: Arc::new(RwLock::new(create_bitmap(0, 0, None))),
            bitmaps: HashMap::new(),
            dirty: false,
            dirty_max_x: 0,
            dirty_max_y: 0,
            dirty_min_x: 0,
            dirty_min_y: 0,
            entries: HashMap::new(),
            entry_order: Vec::new(),
            layout_version: 0,
            lru: Vec::new(),
            max_area: 0,
            max_bytes: 0,
            max_glyphs: 0,
            metrics: GlyphMetrics::default(),
            occupied_area: 0,
            pack_bottom: 0,
            padding: 0,
            rasterizer_backend: default_rasterizer_backend(),
            rasterize_options: Arc::new(GlyphRasterizeOptions {
                font_family: String::new(),
                font_size: 0.0,
                font_style: None,
                font_weight: None,
            }),
            retained_bytes: 0,
            shelves: Vec::new(),
            entry_guard: None,
            guard_repack_count: 0,
        };
    }
}

impl Default for GlyphAtlas {
    fn default() -> Self {
        return GlyphAtlas {
            runtime: EntityRuntimeSlot::default(),
            atlas_runtime: Arc::new(RwLock::new(GlyphAtlasRuntime::default())),
        };
    }
}

impl Default for GlyphSource {
    fn default() -> Self {
        return GlyphSource {
            runtime: EntityRuntimeSlot::default(),
            get_glyph_atlas_image: Arc::new(|_page| None),
            get_glyph_entry: Arc::new(|_codepoint| None),
            get_glyph_kerning: Arc::new(|_left, _right| 0.0),
            get_glyph_layout_version: Arc::new(|| 0),
            get_glyph_metrics: Arc::new(GlyphMetrics::default),
        };
    }
}

impl GlyphSource {
    pub fn glyph_atlas_image(&self, page: Option<u32>) -> Option<TextureSourceRef> {
        return call_glyph_source_get_glyph_atlas_image(self, page);
    }

    pub fn glyph_entry(&self, codepoint: u32) -> Option<Ref<GlyphEntry>> {
        return call_glyph_source_get_glyph_entry(self, codepoint);
    }

    pub fn glyph_kerning(&self, left: u32, right: u32) -> f32 {
        return call_glyph_source_get_glyph_kerning(self, left, right);
    }

    pub fn glyph_layout_version(&self) -> u32 {
        return call_glyph_source_get_glyph_layout_version(self);
    }

    pub fn glyph_metrics(&self) -> GlyphMetrics {
        return call_glyph_source_get_glyph_metrics(self);
    }
}

flight_entity::impl_entity!(GlyphAtlas);
flight_entity::impl_entity!(GlyphSource);
