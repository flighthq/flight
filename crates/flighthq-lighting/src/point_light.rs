//! `PointLight` constructor and kind.

use flighthq_geometry::create_vector3;
use flighthq_types::{KindId, PointLight, Vector3Like};

/// Options for [`create_point_light`]. Mirrors the TS `PointLightOptions`: every
/// field is optional with a default applied at construction. A `None` `position`
/// defaults to the origin; `range` of `-1` is infinite.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct PointLightOptions {
    pub casts_shadow: bool,
    pub color: u32,
    pub intensity: f32,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub position: Option<Vector3Like>,
    pub range: f32,
    pub shadow_bias: f32,
}

impl Default for PointLightOptions {
    fn default() -> Self {
        Self {
            casts_shadow: false,
            color: 0xffffffff,
            intensity: 1.0,
            normal_bias: 0.0,
            pcf_radius: 0.0,
            position: None,
            range: -1.0,
            shadow_bias: 0.0,
        }
    }
}

/// Marker type backing the stable [`KindId`] for point lights.
pub struct PointLightKindId;

/// Returns the stable [`KindId`] for point lights.
pub fn get_point_light_kind() -> KindId {
    KindId::of::<PointLightKindId>()
}

/// Independent copy of a point light's data, including a fresh `position` vector.
pub fn clone_point_light(source: &PointLight) -> PointLight {
    create_point_light(&PointLightOptions {
        casts_shadow: source.casts_shadow,
        color: source.color,
        intensity: source.intensity,
        normal_bias: source.normal_bias,
        pcf_radius: source.pcf_radius,
        position: Some(Vector3Like {
            x: source.position.x,
            y: source.position.y,
            z: source.position.z,
        }),
        range: source.range,
        shadow_bias: source.shadow_bias,
    })
}

/// Omnidirectional point light. `position` is world-space; intensity falls off
/// with distance up to `range` (`-1` = infinite). Color is packed sRGB-albedo
/// RGBA (`0xrrggbbaa`); defaults to opaque white at unit intensity, at the
/// origin, infinite range, shadows off.
pub fn create_point_light(options: &PointLightOptions) -> PointLight {
    let position = match options.position {
        Some(position) => create_vector3(position.x, position.y, position.z),
        None => create_vector3(0.0, 0.0, 0.0),
    };
    PointLight {
        casts_shadow: options.casts_shadow,
        color: options.color,
        intensity: options.intensity,
        normal_bias: options.normal_bias,
        pcf_radius: options.pcf_radius,
        position,
        range: options.range,
        shadow_bias: options.shadow_bias,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod clone_point_light {
        use super::*;

        #[test]
        fn creates_an_independent_copy_with_a_fresh_position_vector() {
            let light = create_point_light(&PointLightOptions {
                casts_shadow: true,
                color: 0x112233ff,
                intensity: 0.5,
                normal_bias: 0.1,
                pcf_radius: 2.0,
                position: Some(Vector3Like {
                    x: 3.0,
                    y: 4.0,
                    z: 5.0,
                }),
                range: 10.0,
                shadow_bias: 0.01,
            });
            let copy = clone_point_light(&light);
            assert!(copy.casts_shadow);
            assert_eq!(copy.color, 0x112233ff);
            assert_eq!(copy.intensity, 0.5);
            assert_eq!(copy.normal_bias, 0.1);
            assert_eq!(copy.pcf_radius, 2.0);
            assert_eq!(copy.position.x, 3.0);
            assert_eq!(copy.range, 10.0);
            assert_eq!(copy.shadow_bias, 0.01);
        }
    }

    mod create_point_light {
        use super::*;

        #[test]
        fn applies_defaults_white_unit_intensity_origin_infinite_range_shadows_off() {
            let light = create_point_light(&PointLightOptions::default());
            assert!(!light.casts_shadow);
            assert_eq!(light.color, 0xffffffff);
            assert_eq!(light.intensity, 1.0);
            assert_eq!(light.normal_bias, 0.0);
            assert_eq!(light.pcf_radius, 0.0);
            assert_eq!(light.position.x, 0.0);
            assert_eq!(light.position.y, 0.0);
            assert_eq!(light.position.z, 0.0);
            assert_eq!(light.range, -1.0);
            assert_eq!(light.shadow_bias, 0.0);
        }

        #[test]
        fn copies_the_supplied_position() {
            let light = create_point_light(&PointLightOptions {
                position: Some(Vector3Like {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                }),
                ..PointLightOptions::default()
            });
            assert_eq!(light.position.y, 2.0);
        }
    }

    mod get_point_light_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_point_light_kind(), get_point_light_kind());
        }
    }
}
