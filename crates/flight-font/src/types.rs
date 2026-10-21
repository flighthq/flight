use std::any::Any;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_buffer::{ArrayBuffer, ArrayBufferView};
use flight_entity::{EntityRuntimeSlot, Uint8Array, Unknown};
use flight_hostcapability::ProviderRef;
use flight_path::Path;

#[cfg(test)]
mod sugar_tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    fn options() -> GlyphRasterizeOptions {
        return GlyphRasterizeOptions {
            font_family: "embedded".to_string(),
            font_size: 16.0,
            font_style: None,
            font_weight: None,
        };
    }

    #[test]
    fn hostglyphrasterizercapability_measure_metrics_matches_the_callback() {
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: Some(Arc::new(|options| {
                return Some(GlyphMetrics {
                    ascent: options.font_size,
                    descent: 2.0,
                    line_gap: 1.0,
                });
            })),
            provider: Arc::new(()),
            rasterize: Arc::new(|_code_point, _options| None),
        };
        let options = options();
        assert_eq!(
            backend.measure_metrics(&options),
            (backend.measure_metrics.as_ref().unwrap())(&options)
        );
    }

    #[test]
    fn hostglyphrasterizercapability_rasterize_preserves_options_identity() {
        let seen = Arc::new(AtomicUsize::new(0));
        let record = seen.clone();
        let backend = HostGlyphRasterizerCapability {
            measure_metrics: None,
            provider: Arc::new(()),
            rasterize: Arc::new(move |_code_point, options| {
                record.store(
                    options as *const GlyphRasterizeOptions as usize,
                    Ordering::SeqCst,
                );
                return None;
            }),
        };
        let options = options();
        assert!(backend.rasterize(0x41, &options).is_none());
        assert_eq!(
            seen.load(Ordering::SeqCst),
            &options as *const GlyphRasterizeOptions as usize
        );
    }
}

/// The two byte containers accepted by `detect_font_format`.
pub enum FontFormatData<'a> {
    ArrayBuffer(FontFormatArrayBuffer<'a>),
    Uint8Array(FontFormatUint8Array<'a>),
}

/// Named payload for a canonical shared `ArrayBuffer`.
pub struct FontFormatArrayBuffer<'a> {
    pub bytes: &'a ArrayBuffer,
}

/// Named payload for a `Uint8Array` view. The slice is the view window, not its whole backing store.
pub struct FontFormatUint8Array<'a> {
    pub bytes: &'a Uint8Array,
}

/// One host-created platform font face. The handle is opaque SDK data; its provider token records
/// which host owns it, and clones of the surrounding `Arc` preserve exact face identity.
// flight-lint: allow(contract-vocabulary) Principal 1015f931: FontFace.handle is the approved opaque Arc<dyn Any + Send + Sync> host handle
pub struct FontFace {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
    pub family: String,
}

/// Named string arm of the source accepted by the host font-face constructor.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FontFaceSourceUrl {
    pub value: String,
}

/// Named bounded-byte-view arm of the source accepted by the host font-face constructor.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FontFaceSourceData {
    pub value: ArrayBufferView,
}

/// The source's `string | ArrayBuffer` union. Rust retains a bounded `ArrayBufferView` so a sliced
/// byte input keeps both its exact window and its shared backing-allocation identity.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FontFaceSource {
    Url(FontFaceSourceUrl),
    Data(FontFaceSourceData),
}

/// A named or loaded font carrier (TS `FontResource extends Entity`).
#[derive(Default)]
pub struct FontResource {
    pub family: String,
    pub face: Option<Arc<FontFace>>,
    runtime: EntityRuntimeSlot,
}

/// One source in the comma-separated list accepted by `load_font_resource_from_urls`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FontUrl {
    pub format: Option<String>,
    pub url: String,
}

/// One variable-font axis declared by a font parser.
#[derive(Clone, Debug, PartialEq)]
pub struct FontVariationAxis {
    pub default_value: f32,
    pub max: f32,
    pub min: f32,
    pub name: String,
    pub tag: String,
}

/// Shared vertical metrics in pixels at a glyph source's configured size.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GlyphMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub line_gap: f32,
}

/// Font-wide vertical metrics in the design-unit coordinate space of a `GlyphOutlineSource`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GlyphOutlineMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub line_gap: f32,
    pub units_per_em: f32,
}

/// Bound, index-keyed vector font callbacks. Sources are Entities whether authored by callers or
/// produced by a font parser; Arc retains the original source and metrics object identities.
#[derive(Clone)]
pub struct GlyphOutlineSource {
    pub get_glyph_outline: Arc<dyn Fn(&mut Path, i32) -> bool + Send + Sync>,
    pub get_glyph_outline_advance: Arc<dyn Fn(i32) -> f32 + Send + Sync>,
    pub get_glyph_outline_index_for_code_point: Arc<dyn Fn(u32) -> i32 + Send + Sync>,
    pub get_glyph_outline_metrics: Arc<dyn Fn() -> Arc<GlyphOutlineMetrics> + Send + Sync>,
    runtime: EntityRuntimeSlot,
}

/// Named numeric arm of `GlyphRasterizeOptions.fontWeight`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GlyphRasterizeFontWeightNumber {
    pub value: f32,
}

/// Named string arm of `GlyphRasterizeOptions.fontWeight`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlyphRasterizeFontWeightString {
    pub value: String,
}

/// The declared `number | string` font-weight union.
#[derive(Clone, Debug, PartialEq)]
pub enum GlyphRasterizeFontWeight {
    Number(GlyphRasterizeFontWeightNumber),
    String(GlyphRasterizeFontWeightString),
}

/// Per-atlas glyph rasterization options, passed unchanged to the selected host capability.
#[derive(Clone, Debug, PartialEq)]
pub struct GlyphRasterizeOptions {
    pub font_family: String,
    pub font_size: f32,
    pub font_style: Option<String>,
    pub font_weight: Option<GlyphRasterizeFontWeight>,
}

/// One RGBA, row-major, straight-alpha glyph bitmap.
#[derive(Clone, Debug, PartialEq)]
pub struct GlyphRasterizedBitmap {
    pub advance: f32,
    pub bearing_x: i32,
    pub bearing_y: i32,
    pub height: u32,
    pub pixels: Box<Uint8Array>,
    pub width: u32,
}

/// Closed operation keys of `HostGlyphRasterizerCapability`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlyphRasterizerOperation {
    MeasureMetrics,
    Rasterize,
}

/// Swappable glyph rasterization capability with canonical provider identity.
#[derive(Clone)]
pub struct HostGlyphRasterizerCapability {
    pub measure_metrics:
        Option<Arc<dyn Fn(&GlyphRasterizeOptions) -> Option<GlyphMetrics> + Send + Sync>>,
    pub provider: ProviderRef,
    pub rasterize:
        Arc<dyn Fn(u32, &GlyphRasterizeOptions) -> Option<GlyphRasterizedBitmap> + Send + Sync>,
}

/// Glyph capability group aggregated by the top-level host.
#[derive(Clone, Default)]
pub struct HostGlyphCapabilities {
    pub rasterizer: Option<HostGlyphRasterizerCapability>,
}

/// A rejected host face operation carries the provider's exact unknown rejection value.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected FontFace Promise preserves the host Unknown payload
pub type FontFaceLoadFuture = Pin<Box<dyn Future<Output = Result<(), Unknown>> + Send>>;

/// A rejected registered-face lookup carries the provider's exact unknown rejection value.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected FontFace[] Promise preserves the host Unknown payload
pub type FontFacesLoadFuture =
    Pin<Box<dyn Future<Output = Result<Vec<Arc<FontFace>>, Unknown>> + Send>>;

/// Swappable platform font-loading capability. Face construction and loading are explicit host
/// callbacks; the SDK never constructs a native or browser `FontFace` itself.
#[derive(Clone)]
pub struct HostFontLoadingCapability {
    pub add_font_face: Arc<dyn Fn(&Arc<FontFace>) + Send + Sync>,
    pub check_font_face: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub create_font_face: Arc<dyn Fn(&str, &FontFaceSource) -> Arc<FontFace> + Send + Sync>,
    pub load_font_face: Arc<dyn Fn(&Arc<FontFace>) -> FontFaceLoadFuture + Send + Sync>,
    pub load_font_faces: Arc<dyn Fn(&str) -> FontFacesLoadFuture + Send + Sync>,
    pub provider: ProviderRef,
    pub when_ready: Arc<dyn Fn() -> FontFaceLoadFuture + Send + Sync>,
}

/// Font capability group aggregated by the top-level host.
#[derive(Clone, Default)]
pub struct HostFontCapabilities {
    pub loader: Option<HostFontLoadingCapability>,
}

fn call_host_glyph_measure_metrics(
    backend: &HostGlyphRasterizerCapability,
    options: &GlyphRasterizeOptions,
) -> Option<GlyphMetrics> {
    return backend
        .measure_metrics
        .as_ref()
        .and_then(|measure_metrics| measure_metrics(options));
}

fn call_host_glyph_rasterize(
    backend: &HostGlyphRasterizerCapability,
    code_point: u32,
    options: &GlyphRasterizeOptions,
) -> Option<GlyphRasterizedBitmap> {
    return (backend.rasterize)(code_point, options);
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS GlyphRasterizerOperation keyof union
pub fn get_glyph_rasterizer_operation_string(value: GlyphRasterizerOperation) -> &'static str {
    return match value {
        GlyphRasterizerOperation::MeasureMetrics => "measureMetrics",
        GlyphRasterizerOperation::Rasterize => "rasterize",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS GlyphRasterizerOperation keyof union
pub fn parse_glyph_rasterizer_operation(value: &str) -> Option<GlyphRasterizerOperation> {
    return match value {
        "measureMetrics" => Some(GlyphRasterizerOperation::MeasureMetrics),
        "rasterize" => Some(GlyphRasterizerOperation::Rasterize),
        _ => None,
    };
}

impl Default for GlyphOutlineSource {
    fn default() -> Self {
        let metrics = Arc::new(GlyphOutlineMetrics {
            ascent: 0.0,
            descent: 0.0,
            line_gap: 0.0,
            units_per_em: 0.0,
        });
        return Self {
            get_glyph_outline: Arc::new(|_, _| false),
            get_glyph_outline_advance: Arc::new(|_| 0.0),
            get_glyph_outline_index_for_code_point: Arc::new(|_| -1),
            get_glyph_outline_metrics: Arc::new(move || Arc::clone(&metrics)),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

flight_entity::impl_entity!(FontResource);
flight_entity::impl_entity!(GlyphOutlineSource);

impl HostGlyphRasterizerCapability {
    pub fn measure_metrics(&self, options: &GlyphRasterizeOptions) -> Option<GlyphMetrics> {
        return call_host_glyph_measure_metrics(self, options);
    }

    pub fn rasterize(
        &self,
        code_point: u32,
        options: &GlyphRasterizeOptions,
    ) -> Option<GlyphRasterizedBitmap> {
        return call_host_glyph_rasterize(self, code_point, options);
    }
}
