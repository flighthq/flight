//! Lens / camera artifact effect constructors.
//!
//! Covers physical-camera artifacts (vignetting, chromatic aberration, lens
//! distortion, flare, dirt) and depth-driven focus (bokeh DoF, tilt-shift).
//! Packed RGBA color fields are unpacked by per-backend recipe code.

use crate::types::{
    BokehDepthOfFieldEffect, ChromaticAberrationEffect, DisplacementEffect, LensDirtEffect,
    LensDistortionEffect, LensFlareEffect, TiltShiftEffect, VignetteEffect,
};

/// Returns a new [`BokehDepthOfFieldEffect`] with the given options.
pub fn create_bokeh_depth_of_field_effect(
    options: BokehDepthOfFieldEffect,
) -> BokehDepthOfFieldEffect {
    options
}

/// Returns a new [`ChromaticAberrationEffect`] with the given options.
pub fn create_chromatic_aberration_effect(
    options: ChromaticAberrationEffect,
) -> ChromaticAberrationEffect {
    options
}

/// Returns a new [`DisplacementEffect`] with the given options.
pub fn create_displacement_effect(options: DisplacementEffect) -> DisplacementEffect {
    options
}

/// Returns a new [`LensDirtEffect`] with the given options.
pub fn create_lens_dirt_effect(options: LensDirtEffect) -> LensDirtEffect {
    options
}

/// Returns a new [`LensDistortionEffect`] with the given options.
pub fn create_lens_distortion_effect(options: LensDistortionEffect) -> LensDistortionEffect {
    options
}

/// Returns a new [`LensFlareEffect`] with the given options.
pub fn create_lens_flare_effect(options: LensFlareEffect) -> LensFlareEffect {
    options
}

/// Returns a new [`TiltShiftEffect`] with the given options.
pub fn create_tilt_shift_effect(options: TiltShiftEffect) -> TiltShiftEffect {
    options
}

/// Returns a new [`VignetteEffect`] with the given options.
pub fn create_vignette_effect(options: VignetteEffect) -> VignetteEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_bokeh_depth_of_field_effect_returns_descriptor() {
        let effect = create_bokeh_depth_of_field_effect(BokehDepthOfFieldEffect {
            focus_distance: Some(0.5),
            focus_range: Some(0.2),
            max_blur: Some(4.0),
        });
        assert_eq!(effect.focus_distance, Some(0.5));
        assert_eq!(effect.focus_range, Some(0.2));
        assert_eq!(effect.max_blur, Some(4.0));
    }

    #[test]
    fn create_chromatic_aberration_effect_returns_descriptor() {
        let effect = create_chromatic_aberration_effect(ChromaticAberrationEffect {
            intensity: Some(0.01),
            radial: Some(false),
        });
        assert_eq!(effect.intensity, Some(0.01));
        assert_eq!(effect.radial, Some(false));
    }

    #[test]
    fn create_displacement_effect_returns_descriptor() {
        let effect = create_displacement_effect(DisplacementEffect {
            intensity: Some(10.0),
            frequency: Some(14.0),
            seed: Some(2.0),
        });
        assert_eq!(effect.intensity, Some(10.0));
        assert_eq!(effect.frequency, Some(14.0));
        assert_eq!(effect.seed, Some(2.0));
    }

    #[test]
    fn create_lens_dirt_effect_returns_descriptor() {
        let effect = create_lens_dirt_effect(LensDirtEffect {
            intensity: Some(1.5),
            threshold: Some(0.45),
            seed: Some(4.0),
        });
        assert_eq!(effect.intensity, Some(1.5));
        assert_eq!(effect.threshold, Some(0.45));
        assert_eq!(effect.seed, Some(4.0));
    }

    #[test]
    fn create_lens_distortion_effect_returns_descriptor() {
        let effect = create_lens_distortion_effect(LensDistortionEffect {
            amount: Some(0.3),
            scale: Some(0.9),
        });
        assert_eq!(effect.amount, Some(0.3));
        assert_eq!(effect.scale, Some(0.9));
    }

    #[test]
    fn create_lens_flare_effect_returns_descriptor() {
        let effect = create_lens_flare_effect(LensFlareEffect {
            threshold: Some(0.8),
            intensity: Some(2.0),
            ghosts: Some(4),
            halo: Some(0.5),
        });
        assert_eq!(effect.threshold, Some(0.8));
        assert_eq!(effect.intensity, Some(2.0));
        assert_eq!(effect.ghosts, Some(4));
        assert_eq!(effect.halo, Some(0.5));
    }

    #[test]
    fn create_tilt_shift_effect_returns_descriptor() {
        let effect = create_tilt_shift_effect(TiltShiftEffect {
            center: Some(0.5),
            width: Some(0.2),
            blur: Some(4.0),
        });
        assert_eq!(effect.center, Some(0.5));
        assert_eq!(effect.width, Some(0.2));
        assert_eq!(effect.blur, Some(4.0));
    }

    #[test]
    fn create_vignette_effect_returns_descriptor() {
        let effect = create_vignette_effect(VignetteEffect {
            intensity: Some(1.0),
            radius: Some(0.7),
            softness: Some(0.4),
            color: Some(0x000000ff),
        });
        assert_eq!(effect.intensity, Some(1.0));
        assert_eq!(effect.radius, Some(0.7));
        assert_eq!(effect.softness, Some(0.4));
        assert_eq!(effect.color, Some(0x000000ff));
    }
}
