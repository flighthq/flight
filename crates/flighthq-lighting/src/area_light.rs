//! `AreaLight` constructor and kind.

use flighthq_geometry::create_vector3;
use flighthq_types::{AreaLight, KindId, Vector3Like};

/// Options for [`create_area_light`]. Mirrors the TS `AreaLightOptions`: every
/// field is optional with a default applied at construction. `None` vectors
/// default to facing down `(0, -1, 0)` at the origin with unit half-extent axes
/// `right (1, 0, 0)` / `up (0, 0, 1)`; `range` of `-1` is infinite.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct AreaLightOptions {
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Option<Vector3Like>,
    pub intensity: f32,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub position: Option<Vector3Like>,
    pub range: f32,
    /// Half-extent axis along the rectangle's width; its length encodes the
    /// half-width.
    pub right: Option<Vector3Like>,
    pub shadow_bias: f32,
    /// Half-extent axis along the rectangle's height; its length encodes the
    /// half-height.
    pub up: Option<Vector3Like>,
}

impl Default for AreaLightOptions {
    fn default() -> Self {
        Self {
            casts_shadow: false,
            color: 0xffffffff,
            direction: None,
            intensity: 1.0,
            normal_bias: 0.0,
            pcf_radius: 0.0,
            position: None,
            range: -1.0,
            right: None,
            shadow_bias: 0.0,
            up: None,
        }
    }
}

/// Marker type backing the stable [`KindId`] for area lights.
pub struct AreaLightKindId;

/// Returns the stable [`KindId`] for area lights.
pub fn get_area_light_kind() -> KindId {
    KindId::of::<AreaLightKindId>()
}

/// Independent copy of an area light's data, including fresh
/// position/direction/right/up vectors.
pub fn clone_area_light(source: &AreaLight) -> AreaLight {
    AreaLight {
        casts_shadow: source.casts_shadow,
        color: source.color,
        direction: create_vector3(source.direction.x, source.direction.y, source.direction.z),
        intensity: source.intensity,
        normal_bias: source.normal_bias,
        pcf_radius: source.pcf_radius,
        position: create_vector3(source.position.x, source.position.y, source.position.z),
        range: source.range,
        right: create_vector3(source.right.x, source.right.y, source.right.z),
        shadow_bias: source.shadow_bias,
        up: create_vector3(source.up.x, source.up.y, source.up.z),
    }
}

/// Rectangular area light (LTC-shaded). `position` is the rectangle center,
/// `direction` its facing normal, `right`/`up` its half-extent axes (length
/// encodes half-width/half-height). Color is packed sRGB-albedo RGBA
/// (`0xrrggbbaa`); defaults to opaque white at unit intensity, at the origin
/// facing down `(0, -1, 0)`, unit-half-extent `(1,0,0)`/`(0,0,1)` rectangle,
/// infinite range, shadows off.
pub fn create_area_light(options: &AreaLightOptions) -> AreaLight {
    let direction = match options.direction {
        Some(direction) => create_vector3(direction.x, direction.y, direction.z),
        None => create_vector3(0.0, -1.0, 0.0),
    };
    let position = match options.position {
        Some(position) => create_vector3(position.x, position.y, position.z),
        None => create_vector3(0.0, 0.0, 0.0),
    };
    let right = match options.right {
        Some(right) => create_vector3(right.x, right.y, right.z),
        None => create_vector3(1.0, 0.0, 0.0),
    };
    let up = match options.up {
        Some(up) => create_vector3(up.x, up.y, up.z),
        None => create_vector3(0.0, 0.0, 1.0),
    };
    AreaLight {
        casts_shadow: options.casts_shadow,
        color: options.color,
        direction,
        intensity: options.intensity,
        normal_bias: options.normal_bias,
        pcf_radius: options.pcf_radius,
        position,
        range: options.range,
        right,
        shadow_bias: options.shadow_bias,
        up,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod clone_area_light {
        use super::*;

        #[test]
        fn creates_an_independent_copy_with_fresh_vectors() {
            let light = create_area_light(&AreaLightOptions {
                casts_shadow: true,
                color: 0x112233ff,
                direction: Some(Vector3Like {
                    x: 0.0,
                    y: 0.0,
                    z: -1.0,
                }),
                intensity: 0.5,
                normal_bias: 0.1,
                pcf_radius: 2.0,
                position: Some(Vector3Like {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                }),
                range: 8.0,
                right: Some(Vector3Like {
                    x: 2.0,
                    y: 0.0,
                    z: 0.0,
                }),
                shadow_bias: 0.01,
                up: Some(Vector3Like {
                    x: 0.0,
                    y: 3.0,
                    z: 0.0,
                }),
            });
            let copy = clone_area_light(&light);
            assert!(copy.casts_shadow);
            assert_eq!(copy.color, 0x112233ff);
            assert_eq!(copy.direction.z, -1.0);
            assert_eq!(copy.intensity, 0.5);
            assert_eq!(copy.normal_bias, 0.1);
            assert_eq!(copy.pcf_radius, 2.0);
            assert_eq!(copy.position.y, 2.0);
            assert_eq!(copy.range, 8.0);
            assert_eq!(copy.right.x, 2.0);
            assert_eq!(copy.shadow_bias, 0.01);
            assert_eq!(copy.up.y, 3.0);
        }
    }

    mod create_area_light {
        use super::*;

        #[test]
        fn applies_defaults_white_unit_intensity_origin_facing_down_unit_half_extents() {
            let light = create_area_light(&AreaLightOptions::default());
            assert!(!light.casts_shadow);
            assert_eq!(light.color, 0xffffffff);
            assert_eq!(light.direction.y, -1.0);
            assert_eq!(light.intensity, 1.0);
            assert_eq!(light.normal_bias, 0.0);
            assert_eq!(light.pcf_radius, 0.0);
            assert_eq!(light.position.x, 0.0);
            assert_eq!(light.range, -1.0);
            assert_eq!(light.right.x, 1.0);
            assert_eq!(light.shadow_bias, 0.0);
            assert_eq!(light.up.z, 1.0);
        }

        #[test]
        fn copies_the_supplied_vectors() {
            let light = create_area_light(&AreaLightOptions {
                right: Some(Vector3Like {
                    x: 4.0,
                    y: 0.0,
                    z: 0.0,
                }),
                up: Some(Vector3Like {
                    x: 0.0,
                    y: 0.0,
                    z: 5.0,
                }),
                ..AreaLightOptions::default()
            });
            assert_eq!(light.right.x, 4.0);
            assert_eq!(light.up.z, 5.0);
        }
    }

    mod get_area_light_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_area_light_kind(), get_area_light_kind());
        }
    }
}
