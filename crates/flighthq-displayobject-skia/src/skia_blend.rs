//! Maps Flight's Flash/OpenFL `BlendMode` onto tiny-skia's Porter-Duff /
//! separable blend modes. Mirrors the per-backend blend mapping the TS Canvas
//! renderer performs through `globalCompositeOperation`.

use flighthq_types::blend::BlendMode;
use tiny_skia::BlendMode as SkiaBlendMode;

/// Resolves a Flight `BlendMode` (or `None`, treated as `Normal`) to the
/// tiny-skia blend mode used when compositing the primitive onto the pixmap.
///
/// `Normal`/`Alpha`/`Layer` map to `SourceOver` (standard alpha compositing).
/// `Erase` maps to `DestinationOut` (the fill's coverage punches a hole, the
/// Flash erase semantic). `Add` maps to `Plus`; the named separable modes map
/// to their tiny-skia equivalents. `Shader` and `Invert` have no separable
/// tiny-skia equivalent in the software path and fall back to `SourceOver`;
/// see TODO(align).
pub fn resolve_skia_blend_mode(blend: Option<BlendMode>) -> SkiaBlendMode {
    match blend.unwrap_or(BlendMode::Normal) {
        BlendMode::Normal | BlendMode::Alpha | BlendMode::Layer => SkiaBlendMode::SourceOver,
        BlendMode::Add => SkiaBlendMode::Plus,
        BlendMode::Erase => SkiaBlendMode::DestinationOut,
        BlendMode::Darken => SkiaBlendMode::Darken,
        BlendMode::Difference => SkiaBlendMode::Difference,
        BlendMode::Hardlight => SkiaBlendMode::HardLight,
        BlendMode::Lighten => SkiaBlendMode::Lighten,
        BlendMode::Multiply => SkiaBlendMode::Multiply,
        BlendMode::Overlay => SkiaBlendMode::Overlay,
        BlendMode::Screen => SkiaBlendMode::Screen,
        BlendMode::Subtract => SkiaBlendMode::Multiply, // TODO(align): no exact tiny-skia subtract.
        // TODO(align): Invert and Shader need a CPU pass; fall back to alpha-over for now.
        BlendMode::Invert | BlendMode::Shader => SkiaBlendMode::SourceOver,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_skia_blend_mode_defaults_to_source_over() {
        assert_eq!(resolve_skia_blend_mode(None), SkiaBlendMode::SourceOver);
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Normal)),
            SkiaBlendMode::SourceOver
        );
    }

    #[test]
    fn resolve_skia_blend_mode_add_is_plus() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Add)),
            SkiaBlendMode::Plus
        );
    }

    #[test]
    fn resolve_skia_blend_mode_erase_is_destination_out() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Erase)),
            SkiaBlendMode::DestinationOut
        );
    }

    #[test]
    fn resolve_skia_blend_mode_multiply_maps_through() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Multiply)),
            SkiaBlendMode::Multiply
        );
    }
}
