//! `DirectionalLight` constructor and kind.

use flighthq_geometry::create_vector3;
use flighthq_types::{DirectionalLight, KindId, Vector3Like};

/// Options for [`create_directional_light`]. Mirrors the TS
/// `DirectionalLightOptions`: every field is optional with a default applied at
/// construction. A `None` `direction` defaults to straight down `(0, -1, 0)`.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct DirectionalLightOptions {
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Option<Vector3Like>,
    pub intensity: f32,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub shadow_bias: f32,
}

impl Default for DirectionalLightOptions {
    fn default() -> Self {
        Self {
            casts_shadow: false,
            color: 0xffffffff,
            direction: None,
            intensity: 1.0,
            normal_bias: 0.0,
            pcf_radius: 0.0,
            shadow_bias: 0.0,
        }
    }
}

/// Marker type backing the stable [`KindId`] for directional lights.
pub struct DirectionalLightKindId;

/// Returns the stable [`KindId`] for directional lights.
pub fn get_directional_light_kind() -> KindId {
    KindId::of::<DirectionalLightKindId>()
}

/// Independent copy of a directional light's data, including a fresh `direction`
/// vector. `Vector3` is a value type, so the copy never aliases the source.
pub fn clone_directional_light(source: &DirectionalLight) -> DirectionalLight {
    create_directional_light(&DirectionalLightOptions {
        casts_shadow: source.casts_shadow,
        color: source.color,
        direction: Some(Vector3Like {
            x: source.direction.x,
            y: source.direction.y,
            z: source.direction.z,
        }),
        intensity: source.intensity,
        normal_bias: source.normal_bias,
        pcf_radius: source.pcf_radius,
        shadow_bias: source.shadow_bias,
    })
}

/// Infinitely distant directional light (sun). `direction` is the world-space
/// travel direction of the light; surfaces are lit from `-direction`. Color is
/// packed sRGB-albedo RGBA (`0xrrggbbaa`); defaults to opaque white at unit
/// intensity, pointing straight down `(0, -1, 0)` with shadows off.
pub fn create_directional_light(options: &DirectionalLightOptions) -> DirectionalLight {
    let direction = match options.direction {
        Some(direction) => create_vector3(direction.x, direction.y, direction.z),
        None => create_vector3(0.0, -1.0, 0.0),
    };
    DirectionalLight {
        casts_shadow: options.casts_shadow,
        color: options.color,
        direction,
        intensity: options.intensity,
        normal_bias: options.normal_bias,
        pcf_radius: options.pcf_radius,
        shadow_bias: options.shadow_bias,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod clone_directional_light {
        use super::*;

        #[test]
        fn creates_an_independent_copy_with_a_fresh_direction_vector() {
            let light = create_directional_light(&DirectionalLightOptions {
                casts_shadow: true,
                color: 0x112233ff,
                direction: Some(Vector3Like {
                    x: 1.0,
                    y: 0.0,
                    z: 0.0,
                }),
                intensity: 0.5,
                normal_bias: 0.1,
                pcf_radius: 2.0,
                shadow_bias: 0.01,
            });
            let copy = clone_directional_light(&light);
            assert!(copy.casts_shadow);
            assert_eq!(copy.color, 0x112233ff);
            assert_eq!(copy.direction.x, 1.0);
            assert_eq!(copy.intensity, 0.5);
            assert_eq!(copy.normal_bias, 0.1);
            assert_eq!(copy.pcf_radius, 2.0);
            assert_eq!(copy.shadow_bias, 0.01);
        }
    }

    mod create_directional_light {
        use super::*;

        #[test]
        fn applies_defaults_white_unit_intensity_downward_shadows_off() {
            let light = create_directional_light(&DirectionalLightOptions::default());
            assert!(!light.casts_shadow);
            assert_eq!(light.color, 0xffffffff);
            assert_eq!(light.direction.x, 0.0);
            assert_eq!(light.direction.y, -1.0);
            assert_eq!(light.direction.z, 0.0);
            assert_eq!(light.intensity, 1.0);
            assert_eq!(light.normal_bias, 0.0);
            assert_eq!(light.pcf_radius, 0.0);
            assert_eq!(light.shadow_bias, 0.0);
        }

        #[test]
        fn copies_the_supplied_direction() {
            let light = create_directional_light(&DirectionalLightOptions {
                direction: Some(Vector3Like {
                    x: 0.0,
                    y: 0.0,
                    z: 1.0,
                }),
                ..DirectionalLightOptions::default()
            });
            assert_eq!(light.direction.z, 1.0);
        }
    }

    mod get_directional_light_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_directional_light_kind(), get_directional_light_kind());
        }
    }
}
