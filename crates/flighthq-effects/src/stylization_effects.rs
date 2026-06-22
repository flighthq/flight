//! Stylization effect constructors.
//!
//! Non-photoreal looks: film grain, scanlines, CRT, pixelation, halftone,
//! dithering, outlines, sharpening, Kuwahara oil-paint, and pencil sketch.

use crate::types::{
    CrtEffect, DitherEffect, FilmGrainEffect, GlitchEffect, HalftoneEffect, KuwaharaEffect,
    OutlineEffect, PixelateEffect, ScanlinesEffect, SharpenEffect, SketchEffect,
};

/// Returns a new [`CrtEffect`] with the given options.
pub fn create_crt_effect(options: CrtEffect) -> CrtEffect {
    options
}

/// Returns a new [`DitherEffect`] with the given options.
pub fn create_dither_effect(options: DitherEffect) -> DitherEffect {
    options
}

/// Returns a new [`FilmGrainEffect`] with the given options.
pub fn create_film_grain_effect(options: FilmGrainEffect) -> FilmGrainEffect {
    options
}

/// Returns a new [`GlitchEffect`] with the given options.
pub fn create_glitch_effect(options: GlitchEffect) -> GlitchEffect {
    options
}

/// Returns a new [`HalftoneEffect`] with the given options.
pub fn create_halftone_effect(options: HalftoneEffect) -> HalftoneEffect {
    options
}

/// Returns a new [`KuwaharaEffect`] with the given options.
pub fn create_kuwahara_effect(options: KuwaharaEffect) -> KuwaharaEffect {
    options
}

/// Returns a new [`OutlineEffect`] with the given options.
pub fn create_outline_effect(options: OutlineEffect) -> OutlineEffect {
    options
}

/// Returns a new [`PixelateEffect`] with the given options.
pub fn create_pixelate_effect(options: PixelateEffect) -> PixelateEffect {
    options
}

/// Returns a new [`ScanlinesEffect`] with the given options.
pub fn create_scanlines_effect(options: ScanlinesEffect) -> ScanlinesEffect {
    options
}

/// Returns a new [`SharpenEffect`] with the given options.
pub fn create_sharpen_effect(options: SharpenEffect) -> SharpenEffect {
    options
}

/// Returns a new [`SketchEffect`] with the given options.
pub fn create_sketch_effect(options: SketchEffect) -> SketchEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_crt_effect_returns_descriptor() {
        let effect = create_crt_effect(CrtEffect {
            curvature: Some(0.2),
            scanline_intensity: Some(0.5),
            vignette: Some(0.3),
            aberration: Some(0.01),
        });
        assert_eq!(effect.curvature, Some(0.2));
        assert_eq!(effect.scanline_intensity, Some(0.5));
        assert_eq!(effect.vignette, Some(0.3));
        assert_eq!(effect.aberration, Some(0.01));
    }

    #[test]
    fn create_dither_effect_returns_descriptor() {
        let effect = create_dither_effect(DitherEffect { levels: Some(4) });
        assert_eq!(effect.levels, Some(4));
    }

    #[test]
    fn create_film_grain_effect_returns_descriptor() {
        let effect = create_film_grain_effect(FilmGrainEffect {
            intensity: Some(0.3),
            size: Some(2.0),
            seed: Some(7.0),
        });
        assert_eq!(effect.intensity, Some(0.3));
        assert_eq!(effect.size, Some(2.0));
        assert_eq!(effect.seed, Some(7.0));
    }

    #[test]
    fn create_glitch_effect_returns_descriptor() {
        let effect = create_glitch_effect(GlitchEffect {
            intensity: Some(0.7),
            block_size: Some(22.0),
            color_shift: Some(12.0),
            seed: Some(3.0),
        });
        assert_eq!(effect.intensity, Some(0.7));
        assert_eq!(effect.block_size, Some(22.0));
        assert_eq!(effect.color_shift, Some(12.0));
        assert_eq!(effect.seed, Some(3.0));
    }

    #[test]
    fn create_halftone_effect_returns_descriptor() {
        let effect = create_halftone_effect(HalftoneEffect {
            scale: Some(6.0),
            angle: Some(0.5),
        });
        assert_eq!(effect.scale, Some(6.0));
        assert_eq!(effect.angle, Some(0.5));
    }

    #[test]
    fn create_kuwahara_effect_returns_descriptor() {
        let effect = create_kuwahara_effect(KuwaharaEffect { radius: Some(3) });
        assert_eq!(effect.radius, Some(3));
    }

    #[test]
    fn create_outline_effect_returns_descriptor() {
        let effect = create_outline_effect(OutlineEffect {
            threshold: Some(0.2),
            thickness: Some(1.5),
            color: Some(0x000000ff),
        });
        assert_eq!(effect.threshold, Some(0.2));
        assert_eq!(effect.thickness, Some(1.5));
        assert_eq!(effect.color, Some(0x000000ff));
    }

    #[test]
    fn create_pixelate_effect_returns_descriptor() {
        let effect = create_pixelate_effect(PixelateEffect { size: Some(8.0) });
        assert_eq!(effect.size, Some(8.0));
    }

    #[test]
    fn create_scanlines_effect_returns_descriptor() {
        let effect = create_scanlines_effect(ScanlinesEffect {
            count: Some(240.0),
            intensity: Some(0.4),
        });
        assert_eq!(effect.count, Some(240.0));
        assert_eq!(effect.intensity, Some(0.4));
    }

    #[test]
    fn create_sharpen_effect_returns_descriptor() {
        let effect = create_sharpen_effect(SharpenEffect { amount: Some(0.6) });
        assert_eq!(effect.amount, Some(0.6));
    }

    #[test]
    fn create_sketch_effect_returns_descriptor() {
        let effect = create_sketch_effect(SketchEffect {
            strength: Some(0.8),
        });
        assert_eq!(effect.strength, Some(0.8));
    }
}
