//! HDR / tone-mapping effect constructors and shared recipe math.
//!
//! The substrate-agnostic math in this module (e.g. [`compute_bloom_blur_radius`])
//! is consumed by both the GL and WGPU backends so they derive identical parameters
//! from the same intent.

use crate::types::{BloomEffect, ExposureEffect, ToneMapEffect};

/// Returns the blur radius for a bloom bright-pass branch.
///
/// Defaults to `8.0` when unset and clamps negative radii to zero.  Both the GL
/// and WGPU bloom recipes call this so they use the same radius.
pub fn compute_bloom_blur_radius(effect: &BloomEffect) -> f32 {
    effect.radius.unwrap_or(8.0).max(0.0)
}

/// Returns a new [`BloomEffect`] with the given options.
pub fn create_bloom_effect(options: BloomEffect) -> BloomEffect {
    options
}

/// Returns a new [`ExposureEffect`] with the given options.
pub fn create_exposure_effect(options: ExposureEffect) -> ExposureEffect {
    options
}

/// Returns a new [`ToneMapEffect`] with the given options.
pub fn create_tone_map_effect(options: ToneMapEffect) -> ToneMapEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ToneMapOperator;

    #[test]
    fn compute_bloom_blur_radius_returns_non_negative() {
        assert_eq!(
            compute_bloom_blur_radius(&create_bloom_effect(BloomEffect::default())),
            8.0
        );
        assert_eq!(
            compute_bloom_blur_radius(&create_bloom_effect(BloomEffect {
                radius: Some(-4.0),
                ..Default::default()
            })),
            0.0
        );
    }

    #[test]
    fn create_bloom_effect_returns_descriptor() {
        let effect = create_bloom_effect(BloomEffect {
            threshold: Some(0.5),
            intensity: Some(2.0),
            ..Default::default()
        });
        assert_eq!(effect.threshold, Some(0.5));
        assert_eq!(effect.intensity, Some(2.0));
    }

    #[test]
    fn create_exposure_effect_returns_descriptor() {
        let effect = create_exposure_effect(ExposureEffect {
            exposure: Some(1.0),
        });
        assert_eq!(effect.exposure, Some(1.0));
    }

    #[test]
    fn create_tone_map_effect_returns_descriptor() {
        let effect = create_tone_map_effect(ToneMapEffect {
            operator: Some(ToneMapOperator::Aces),
            ..Default::default()
        });
        assert_eq!(effect.operator, Some(ToneMapOperator::Aces));
    }
}
