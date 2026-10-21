use std::sync::Arc;

use flight_buffer::ArrayBuffer;
use flight_entity::Uint8Array;
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

/// Bound, index-keyed vector font callbacks. The record is immutable shared plain data, not an
/// Entity; parser-produced sources that are Entities retain their own runtime separately.
#[derive(Clone)]
pub struct GlyphOutlineSource {
    pub get_glyph_outline: Arc<dyn Fn(&mut Path, i32) -> bool + Send + Sync>,
    pub get_glyph_outline_advance: Arc<dyn Fn(i32) -> f32 + Send + Sync>,
    pub get_glyph_outline_index_for_code_point: Arc<dyn Fn(u32) -> i32 + Send + Sync>,
    pub get_glyph_outline_metrics: Arc<dyn Fn() -> GlyphOutlineMetrics + Send + Sync>,
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
