//! Maps Flight's Flash/OpenFL `BlendMode` onto tiny-skia's Porter-Duff /
//! separable blend modes for the software path.
//!
//! Two authoritative TS references define the target behavior, and they differ
//! by what their substrate can express:
//!
//! - `@flighthq/displayobject-canvas` maps each mode to a Canvas2D
//!   `globalCompositeOperation`; modes Canvas2D cannot express (`Subtract`,
//!   `Invert`, `Erase`, `Alpha`, `Shader`) are `null` there and degrade to
//!   normal `source-over`.
//! - `@flighthq/surface` (`surfaceComposite`) is the authoritative *software*
//!   compositor and is strictly richer: it implements `Erase` as a
//!   destination-out knockout, `Subtract` as per-channel `max(0, cb - cs)`, and
//!   `Invert` as per-channel `255 - cb`. It rejects only `Alpha` and `Shader`
//!   (no faithful software meaning) and treats every other unlisted mode as
//!   `source-over`.
//!
//! tiny-skia is the in-box software substrate and the conformance *reference*,
//! so it follows the richer `surfaceComposite` semantics, not the lossy Canvas
//! degradation, wherever its blend set allows. tiny-skia's `BlendMode` covers
//! every Flash separable mode except two: it has no `Subtract` (reverse
//! subtract, `dst - src`) and no `Invert` (`1 - dst`, source-independent). Those
//! two are handled by an exact CPU composite pass (`composite_skia_*`), composed
//! from tiny-skia rasterization plus the `surfaceComposite` per-channel math —
//! see [`resolve_skia_blend_strategy`].

use flighthq_types::blend::BlendMode;
use tiny_skia::BlendMode as SkiaBlendMode;

/// How a `BlendMode` is realized in the software path.
///
/// Most modes are expressible directly as a tiny-skia paint blend mode
/// ([`SkiaBlendStrategy::Paint`]). The two Flash modes tiny-skia's blend set
/// lacks exactly — `Subtract` and `Invert` — are realized by an exact CPU
/// composite pass over a rasterized coverage layer
/// ([`SkiaBlendStrategy::CpuSubtract`] / [`SkiaBlendStrategy::CpuInvert`]),
/// matching `@flighthq/surface`'s `surfaceComposite` per-channel math.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum SkiaBlendStrategy {
    /// Composite with this tiny-skia paint blend mode (the fast path).
    Paint(SkiaBlendMode),
    /// `Subtract`: per channel `out = max(0, dst - src)`, then W3C source-over
    /// of the blended color. No tiny-skia paint mode expresses reverse subtract,
    /// so the shape path rasterizes the fill to a scratch layer and composites
    /// it on the CPU.
    CpuSubtract,
    /// `Invert`: per channel `out = 255 - dst` within the source coverage, then
    /// W3C source-over. tiny-skia has no source-independent invert mode, so this
    /// also takes the CPU composite pass.
    CpuInvert,
}

/// Resolves a Flight `BlendMode` (or `None`, treated as `Normal`) to the
/// strategy used when compositing a primitive that *can* take a CPU pass (the
/// shape fill path). Callers limited to a single tiny-skia paint mode (the
/// bitmap blit) use [`resolve_skia_blend_mode`] instead, which folds the CPU
/// modes down to their closest paint approximation.
///
/// The mapping follows `surfaceComposite` (the authoritative software
/// compositor), not the lossy Canvas degradation:
///
/// - `Normal`/`Layer` -> `SourceOver` (standard alpha compositing).
/// - `Alpha`/`Shader` -> `SourceOver`. `surfaceComposite` rejects these outright
///   (no software meaning: `Alpha` needs a parent group's alpha channel, `Shader`
///   needs a custom program); the software leaf renderer has neither, so it
///   degrades to normal compositing rather than erroring, matching the Canvas
///   backend's visible result for an unsupported mode.
/// - `Erase` -> `DestinationOut` (the fill's coverage knocks a hole in the
///   backdrop; the Flash erase semantic and exactly `surfaceComposite`'s erase).
/// - `Add` -> `Plus` (clamped sum; `surfaceComposite` `min(255, cb + cs)`).
/// - The separable modes (`Multiply`/`Screen`/`Overlay`/`Darken`/`Lighten`/
///   `Hardlight`/`Difference`) -> their identical tiny-skia equivalents.
/// - `Subtract` -> [`SkiaBlendStrategy::CpuSubtract`]; `Invert` ->
///   [`SkiaBlendStrategy::CpuInvert`].
pub fn resolve_skia_blend_strategy(blend: Option<BlendMode>) -> SkiaBlendStrategy {
    match blend.unwrap_or(BlendMode::Normal) {
        BlendMode::Subtract => SkiaBlendStrategy::CpuSubtract,
        BlendMode::Invert => SkiaBlendStrategy::CpuInvert,
        other => SkiaBlendStrategy::Paint(resolve_skia_paint_blend_mode(other)),
    }
}

/// Resolves a Flight `BlendMode` (or `None`, treated as `Normal`) to a single
/// tiny-skia paint blend mode, for primitives whose draw call accepts only a
/// paint mode (the bitmap blit via `draw_pixmap`).
///
/// Modes tiny-skia expresses exactly map straight through (see
/// [`resolve_skia_blend_strategy`] for the full table). The two it lacks degrade
/// here to the closest available paint mode, documented precisely because this
/// is a conformance-tolerance divergence:
///
/// - `Subtract` -> `Difference` (`|dst - src|`). This is the nearest *darkening,
///   subtractive* separable mode tiny-skia offers; it equals the exact
///   `max(0, dst - src)` whenever `dst >= src` (the common subtract-to-darken
///   case) and differs only where the source is brighter than the backdrop,
///   where it reflects `src - dst` instead of clamping to 0. The shape path
///   avoids this approximation entirely via [`SkiaBlendStrategy::CpuSubtract`];
///   only the bitmap blit takes it.
/// - `Invert` -> `SourceOver`. tiny-skia has no source-independent `1 - dst`
///   paint mode, and a faithful invert needs the backdrop, so the paint-only
///   blit degrades to normal compositing (matching the Canvas backend, whose
///   `globalCompositeOperation` is also `null` for invert). The shape path is
///   faithful via [`SkiaBlendStrategy::CpuInvert`].
pub fn resolve_skia_blend_mode(blend: Option<BlendMode>) -> SkiaBlendMode {
    match blend.unwrap_or(BlendMode::Normal) {
        // No paint mode is faithful; approximate (see the doc comment).
        BlendMode::Subtract => SkiaBlendMode::Difference,
        BlendMode::Invert => SkiaBlendMode::SourceOver,
        other => resolve_skia_paint_blend_mode(other),
    }
}

/// The exactly-expressible subset of the mapping: every Flash mode tiny-skia
/// covers without approximation. `Subtract` and `Invert` are intentionally not
/// handled here — callers route them through `resolve_skia_blend_strategy` (CPU
/// pass) or `resolve_skia_blend_mode` (paint approximation) instead.
fn resolve_skia_paint_blend_mode(blend: BlendMode) -> SkiaBlendMode {
    match blend {
        BlendMode::Normal | BlendMode::Alpha | BlendMode::Layer | BlendMode::Shader => {
            SkiaBlendMode::SourceOver
        }
        BlendMode::Add => SkiaBlendMode::Plus,
        BlendMode::Erase => SkiaBlendMode::DestinationOut,
        BlendMode::Darken => SkiaBlendMode::Darken,
        BlendMode::Difference => SkiaBlendMode::Difference,
        BlendMode::Hardlight => SkiaBlendMode::HardLight,
        BlendMode::Lighten => SkiaBlendMode::Lighten,
        BlendMode::Multiply => SkiaBlendMode::Multiply,
        BlendMode::Overlay => SkiaBlendMode::Overlay,
        BlendMode::Screen => SkiaBlendMode::Screen,
        // Subtract/Invert never reach here through the public resolvers; treat as
        // normal so the match stays total without a panic on programmer misuse.
        BlendMode::Subtract | BlendMode::Invert => SkiaBlendMode::SourceOver,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_skia_blend_mode_add_is_plus() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Add)),
            SkiaBlendMode::Plus
        );
    }

    #[test]
    fn resolve_skia_blend_mode_defaults_to_source_over() {
        assert_eq!(resolve_skia_blend_mode(None), SkiaBlendMode::SourceOver);
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Normal)),
            SkiaBlendMode::SourceOver
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
    fn resolve_skia_blend_mode_invert_paint_degrades_to_source_over() {
        // The paint-only path (bitmap blit) cannot express invert; it degrades
        // to normal, matching the Canvas backend's null mapping.
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Invert)),
            SkiaBlendMode::SourceOver
        );
    }

    #[test]
    fn resolve_skia_blend_mode_layer_and_alpha_and_shader_are_source_over() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Layer)),
            SkiaBlendMode::SourceOver
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Alpha)),
            SkiaBlendMode::SourceOver
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Shader)),
            SkiaBlendMode::SourceOver
        );
    }

    #[test]
    fn resolve_skia_blend_mode_multiply_maps_through() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Multiply)),
            SkiaBlendMode::Multiply
        );
    }

    #[test]
    fn resolve_skia_blend_mode_separable_modes_map_through() {
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Screen)),
            SkiaBlendMode::Screen
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Overlay)),
            SkiaBlendMode::Overlay
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Darken)),
            SkiaBlendMode::Darken
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Lighten)),
            SkiaBlendMode::Lighten
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Hardlight)),
            SkiaBlendMode::HardLight
        );
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Difference)),
            SkiaBlendMode::Difference
        );
    }

    #[test]
    fn resolve_skia_blend_mode_subtract_approximates_with_difference() {
        // The paint-only path approximates Subtract with Difference; exactness
        // lives in the CPU strategy, asserted below.
        assert_eq!(
            resolve_skia_blend_mode(Some(BlendMode::Subtract)),
            SkiaBlendMode::Difference
        );
    }

    #[test]
    fn resolve_skia_blend_strategy_defaults_to_paint_source_over() {
        assert_eq!(
            resolve_skia_blend_strategy(None),
            SkiaBlendStrategy::Paint(SkiaBlendMode::SourceOver)
        );
    }

    #[test]
    fn resolve_skia_blend_strategy_invert_takes_cpu_pass() {
        assert_eq!(
            resolve_skia_blend_strategy(Some(BlendMode::Invert)),
            SkiaBlendStrategy::CpuInvert
        );
    }

    #[test]
    fn resolve_skia_blend_strategy_paint_modes_match_paint_resolver() {
        for mode in [
            BlendMode::Normal,
            BlendMode::Add,
            BlendMode::Erase,
            BlendMode::Multiply,
            BlendMode::Screen,
            BlendMode::Overlay,
            BlendMode::Darken,
            BlendMode::Lighten,
            BlendMode::Hardlight,
            BlendMode::Difference,
            BlendMode::Layer,
            BlendMode::Alpha,
            BlendMode::Shader,
        ] {
            assert_eq!(
                resolve_skia_blend_strategy(Some(mode)),
                SkiaBlendStrategy::Paint(resolve_skia_blend_mode(Some(mode))),
                "mode {mode:?}"
            );
        }
    }

    #[test]
    fn resolve_skia_blend_strategy_subtract_takes_cpu_pass() {
        assert_eq!(
            resolve_skia_blend_strategy(Some(BlendMode::Subtract)),
            SkiaBlendStrategy::CpuSubtract
        );
    }
}
