//! Motion-blur effect constructors.
//!
//! `MotionBlur` requires a per-pixel velocity buffer; per-backend recipes fall
//! back to a passthrough copy when no velocity texture is supplied.

use crate::types::{
    CameraMotionBlurEffect, DirectionalBlurEffect, MotionBlurEffect, RadialBlurEffect,
};

/// Returns a new [`CameraMotionBlurEffect`] with the given options.
pub fn create_camera_motion_blur_effect(options: CameraMotionBlurEffect) -> CameraMotionBlurEffect {
    options
}

/// Returns a new [`DirectionalBlurEffect`] with the given options.
pub fn create_directional_blur_effect(options: DirectionalBlurEffect) -> DirectionalBlurEffect {
    options
}

/// Returns a new [`MotionBlurEffect`] with the given options.
pub fn create_motion_blur_effect(options: MotionBlurEffect) -> MotionBlurEffect {
    options
}

/// Returns a new [`RadialBlurEffect`] with the given options.
pub fn create_radial_blur_effect(options: RadialBlurEffect) -> RadialBlurEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_camera_motion_blur_effect_returns_descriptor() {
        let effect = create_camera_motion_blur_effect(CameraMotionBlurEffect {
            intensity: Some(0.5),
            samples: Some(12),
        });
        assert_eq!(effect.intensity, Some(0.5));
        assert_eq!(effect.samples, Some(12));
    }

    #[test]
    fn create_directional_blur_effect_returns_descriptor() {
        let effect = create_directional_blur_effect(DirectionalBlurEffect {
            angle: Some(1.0),
            length: Some(8.0),
            ..Default::default()
        });
        assert_eq!(effect.angle, Some(1.0));
        assert_eq!(effect.length, Some(8.0));
    }

    #[test]
    fn create_motion_blur_effect_returns_descriptor() {
        let effect = create_motion_blur_effect(MotionBlurEffect {
            intensity: Some(0.8),
            samples: Some(12),
        });
        assert_eq!(effect.intensity, Some(0.8));
        assert_eq!(effect.samples, Some(12));
    }

    #[test]
    fn create_radial_blur_effect_returns_descriptor() {
        let effect = create_radial_blur_effect(RadialBlurEffect {
            center_x: Some(0.5),
            center_y: Some(0.5),
            strength: Some(0.2),
            ..Default::default()
        });
        assert_eq!(effect.center_x, Some(0.5));
        assert_eq!(effect.center_y, Some(0.5));
        assert_eq!(effect.strength, Some(0.2));
    }
}
