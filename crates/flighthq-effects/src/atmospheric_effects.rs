//! Atmospheric / depth effect constructors.
//!
//! Several of these (`ScreenSpaceFog`, `Ssao`, `Ssr`) require a sampleable
//! depth (and normals) texture; per-backend recipes fall back to color-only
//! approximations when depth is absent.

use crate::types::{GodRaysEffect, ScreenSpaceFogEffect, SsaoEffect, SsrEffect};

/// Returns a new [`GodRaysEffect`] with the given options.
pub fn create_god_rays_effect(options: GodRaysEffect) -> GodRaysEffect {
    options
}

/// Returns a new [`ScreenSpaceFogEffect`] with the given options.
pub fn create_screen_space_fog_effect(options: ScreenSpaceFogEffect) -> ScreenSpaceFogEffect {
    options
}

/// Returns a new [`SsaoEffect`] with the given options.
pub fn create_ssao_effect(options: SsaoEffect) -> SsaoEffect {
    options
}

/// Returns a new [`SsrEffect`] with the given options.
pub fn create_ssr_effect(options: SsrEffect) -> SsrEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_god_rays_effect_returns_descriptor() {
        let effect = create_god_rays_effect(GodRaysEffect {
            center_x: Some(0.5),
            center_y: Some(0.25),
            density: Some(0.9),
            ..Default::default()
        });
        assert_eq!(effect.center_x, Some(0.5));
        assert_eq!(effect.center_y, Some(0.25));
        assert_eq!(effect.density, Some(0.9));
    }

    #[test]
    fn create_screen_space_fog_effect_returns_descriptor() {
        let effect = create_screen_space_fog_effect(ScreenSpaceFogEffect {
            color: Some(0xaabbccff),
            density: Some(0.4),
            ..Default::default()
        });
        assert_eq!(effect.color, Some(0xaabbccff));
        assert_eq!(effect.density, Some(0.4));
    }

    #[test]
    fn create_ssao_effect_returns_descriptor() {
        let effect = create_ssao_effect(SsaoEffect {
            radius: Some(4.0),
            intensity: Some(1.5),
            ..Default::default()
        });
        assert_eq!(effect.radius, Some(4.0));
        assert_eq!(effect.intensity, Some(1.5));
    }

    #[test]
    fn create_ssr_effect_returns_descriptor() {
        let effect = create_ssr_effect(SsrEffect {
            max_distance: Some(10.0),
            steps: Some(32),
            ..Default::default()
        });
        assert_eq!(effect.max_distance, Some(10.0));
        assert_eq!(effect.steps, Some(32));
    }
}
