//! `SpotLight` constructor, cone helper, and kind.

use flighthq_geometry::create_vector3;
use flighthq_types::{KindId, SpotLight, Vector3Like};

/// Options for [`create_spot_light`]. Mirrors the TS `SpotLightOptions`: every
/// field is optional with a default applied at construction. A `None`
/// `position` defaults to the origin and a `None` `direction` to straight down
/// `(0, -1, 0)`. The cone half-angles are given in degrees; defaults are a
/// `0`-degree inner / `45`-degree outer cone.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct SpotLightOptions {
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Option<Vector3Like>,
    /// Inner cone half-angle in degrees; full intensity inside it. Defaults to
    /// `0` (a sharp center).
    pub inner_cone_degrees: f32,
    pub intensity: f32,
    pub normal_bias: f32,
    /// Outer cone half-angle in degrees; intensity reaches zero at it. Defaults
    /// to `45`.
    pub outer_cone_degrees: f32,
    pub pcf_radius: f32,
    pub position: Option<Vector3Like>,
    pub range: f32,
    pub shadow_bias: f32,
}

impl Default for SpotLightOptions {
    fn default() -> Self {
        Self {
            casts_shadow: false,
            color: 0xffffffff,
            direction: None,
            inner_cone_degrees: 0.0,
            intensity: 1.0,
            normal_bias: 0.0,
            outer_cone_degrees: 45.0,
            pcf_radius: 0.0,
            position: None,
            range: -1.0,
            shadow_bias: 0.0,
        }
    }
}

/// Marker type backing the stable [`KindId`] for spot lights.
pub struct SpotLightKindId;

/// Returns the stable [`KindId`] for spot lights.
pub fn get_spot_light_kind() -> KindId {
    KindId::of::<SpotLightKindId>()
}

/// Independent copy of a spot light's data, including fresh `position` and
/// `direction` vectors.
pub fn clone_spot_light(source: &SpotLight) -> SpotLight {
    SpotLight {
        casts_shadow: source.casts_shadow,
        color: source.color,
        direction: create_vector3(source.direction.x, source.direction.y, source.direction.z),
        inner_cone_cos: source.inner_cone_cos,
        intensity: source.intensity,
        normal_bias: source.normal_bias,
        outer_cone_cos: source.outer_cone_cos,
        pcf_radius: source.pcf_radius,
        position: create_vector3(source.position.x, source.position.y, source.position.z),
        range: source.range,
        shadow_bias: source.shadow_bias,
    }
}

/// Cone-restricted point light. `position`/`direction` are world-space; the cone
/// is stored as the precomputed cosines of its inner and outer half-angles
/// (`inner_cone_cos >= outer_cone_cos`). Color is packed sRGB-albedo RGBA
/// (`0xrrggbbaa`); defaults to opaque white at unit intensity, at the origin
/// facing down `(0, -1, 0)`, `0`-degree inner / `45`-degree outer cone, infinite
/// range, shadows off.
pub fn create_spot_light(options: &SpotLightOptions) -> SpotLight {
    let direction = match options.direction {
        Some(direction) => create_vector3(direction.x, direction.y, direction.z),
        None => create_vector3(0.0, -1.0, 0.0),
    };
    let position = match options.position {
        Some(position) => create_vector3(position.x, position.y, position.z),
        None => create_vector3(0.0, 0.0, 0.0),
    };
    let mut light = SpotLight {
        casts_shadow: options.casts_shadow,
        color: options.color,
        direction,
        inner_cone_cos: 1.0,
        intensity: options.intensity,
        normal_bias: options.normal_bias,
        outer_cone_cos: 1.0,
        pcf_radius: options.pcf_radius,
        position,
        range: options.range,
        shadow_bias: options.shadow_bias,
    };
    set_spot_light_cone(
        &mut light,
        options.inner_cone_degrees,
        options.outer_cone_degrees,
    );
    light
}

/// Writes the precomputed cone cosines from inner/outer half-angles given in
/// degrees. A larger half-angle yields a smaller cosine, so the stored invariant
/// `inner_cone_cos >= outer_cone_cos` holds exactly when
/// `inner_degrees <= outer_degrees`; callers are responsible for ordering their
/// inputs.
pub fn set_spot_light_cone(out: &mut SpotLight, inner_degrees: f32, outer_degrees: f32) {
    out.inner_cone_cos = (inner_degrees * std::f32::consts::PI / 180.0).cos();
    out.outer_cone_cos = (outer_degrees * std::f32::consts::PI / 180.0).cos();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cos_degrees(degrees: f32) -> f32 {
        (degrees * std::f32::consts::PI / 180.0).cos()
    }

    mod clone_spot_light {
        use super::*;

        #[test]
        fn creates_an_independent_copy_with_fresh_position_and_direction_vectors() {
            let light = create_spot_light(&SpotLightOptions {
                casts_shadow: true,
                color: 0x112233ff,
                direction: Some(Vector3Like {
                    x: 1.0,
                    y: 0.0,
                    z: 0.0,
                }),
                inner_cone_degrees: 10.0,
                intensity: 0.5,
                normal_bias: 0.1,
                outer_cone_degrees: 30.0,
                pcf_radius: 2.0,
                position: Some(Vector3Like {
                    x: 3.0,
                    y: 4.0,
                    z: 5.0,
                }),
                range: 10.0,
                shadow_bias: 0.01,
            });
            let copy = clone_spot_light(&light);
            assert!(copy.casts_shadow);
            assert_eq!(copy.color, 0x112233ff);
            assert_eq!(copy.direction.x, 1.0);
            assert_eq!(copy.inner_cone_cos, light.inner_cone_cos);
            assert_eq!(copy.intensity, 0.5);
            assert_eq!(copy.normal_bias, 0.1);
            assert_eq!(copy.outer_cone_cos, light.outer_cone_cos);
            assert_eq!(copy.pcf_radius, 2.0);
            assert_eq!(copy.position.z, 5.0);
            assert_eq!(copy.range, 10.0);
            assert_eq!(copy.shadow_bias, 0.01);
        }
    }

    mod create_spot_light {
        use super::*;

        #[test]
        fn applies_defaults_white_unit_intensity_origin_facing_down_cone_infinite_range() {
            let light = create_spot_light(&SpotLightOptions::default());
            assert!(!light.casts_shadow);
            assert_eq!(light.color, 0xffffffff);
            assert_eq!(light.direction.y, -1.0);
            assert!((light.inner_cone_cos - 1.0).abs() < 1e-6);
            assert_eq!(light.intensity, 1.0);
            assert_eq!(light.normal_bias, 0.0);
            assert!((light.outer_cone_cos - cos_degrees(45.0)).abs() < 1e-6);
            assert_eq!(light.pcf_radius, 0.0);
            assert_eq!(light.position.x, 0.0);
            assert_eq!(light.range, -1.0);
            assert_eq!(light.shadow_bias, 0.0);
        }

        #[test]
        fn precomputes_cone_cosines_with_inner_ge_outer() {
            let light = create_spot_light(&SpotLightOptions {
                inner_cone_degrees: 20.0,
                outer_cone_degrees: 40.0,
                ..SpotLightOptions::default()
            });
            assert!((light.inner_cone_cos - cos_degrees(20.0)).abs() < 1e-6);
            assert!((light.outer_cone_cos - cos_degrees(40.0)).abs() < 1e-6);
            assert!(light.inner_cone_cos >= light.outer_cone_cos);
        }

        #[test]
        fn copies_supplied_position_and_direction() {
            let light = create_spot_light(&SpotLightOptions {
                direction: Some(Vector3Like {
                    x: 0.0,
                    y: 0.0,
                    z: 1.0,
                }),
                position: Some(Vector3Like {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                }),
                ..SpotLightOptions::default()
            });
            assert_eq!(light.direction.z, 1.0);
            assert_eq!(light.position.x, 1.0);
        }
    }

    mod get_spot_light_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_spot_light_kind(), get_spot_light_kind());
        }
    }

    mod set_spot_light_cone {
        use super::*;

        #[test]
        fn writes_the_cosines_of_the_inner_and_outer_half_angles_into_the_light() {
            let mut light = create_spot_light(&SpotLightOptions::default());
            set_spot_light_cone(&mut light, 15.0, 35.0);
            assert!((light.inner_cone_cos - cos_degrees(15.0)).abs() < 1e-6);
            assert!((light.outer_cone_cos - cos_degrees(35.0)).abs() < 1e-6);
        }

        #[test]
        fn produces_equal_cosines_when_inner_and_outer_angles_match() {
            let mut light = create_spot_light(&SpotLightOptions::default());
            set_spot_light_cone(&mut light, 25.0, 25.0);
            assert!((light.inner_cone_cos - light.outer_cone_cos).abs() < 1e-6);
        }
    }
}
