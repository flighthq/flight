//! `HemisphereLight` constructor and kind.

use flighthq_types::{HemisphereLight, KindId};

/// Options for [`create_hemisphere_light`]. Mirrors the TS
/// `HemisphereLightOptions`: every field is optional with a default applied at
/// construction.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct HemisphereLightOptions {
    pub ground_color: u32,
    pub intensity: f32,
    pub sky_color: u32,
}

impl Default for HemisphereLightOptions {
    fn default() -> Self {
        Self {
            ground_color: 0xffffffff,
            intensity: 1.0,
            sky_color: 0xffffffff,
        }
    }
}

/// Marker type backing the stable [`KindId`] for hemisphere lights.
pub struct HemisphereLightKindId;

/// Returns the stable [`KindId`] for hemisphere lights.
pub fn get_hemisphere_light_kind() -> KindId {
    KindId::of::<HemisphereLightKindId>()
}

/// Independent copy of a hemisphere light's data.
pub fn clone_hemisphere_light(source: &HemisphereLight) -> HemisphereLight {
    create_hemisphere_light(&HemisphereLightOptions {
        ground_color: source.ground_color,
        intensity: source.intensity,
        sky_color: source.sky_color,
    })
}

/// Gradient ambient: `sky_color` from above, `ground_color` from below, blended
/// by the surface normal's vertical component. Colors are packed sRGB-albedo
/// RGBA (`0xrrggbbaa`); both default to opaque white at unit intensity.
/// Hemisphere lights do not cast shadows.
pub fn create_hemisphere_light(options: &HemisphereLightOptions) -> HemisphereLight {
    HemisphereLight {
        ground_color: options.ground_color,
        intensity: options.intensity,
        sky_color: options.sky_color,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod clone_hemisphere_light {
        use super::*;

        #[test]
        fn creates_an_independent_copy_with_the_same_fields() {
            let light = create_hemisphere_light(&HemisphereLightOptions {
                ground_color: 0x223344ff,
                intensity: 0.5,
                sky_color: 0x8899aaff,
            });
            let copy = clone_hemisphere_light(&light);
            assert_eq!(copy.ground_color, 0x223344ff);
            assert_eq!(copy.intensity, 0.5);
            assert_eq!(copy.sky_color, 0x8899aaff);
        }
    }

    mod create_hemisphere_light {
        use super::*;

        #[test]
        fn applies_opaque_white_defaults_at_unit_intensity_for_both_colors() {
            let light = create_hemisphere_light(&HemisphereLightOptions::default());
            assert_eq!(light.ground_color, 0xffffffff);
            assert_eq!(light.intensity, 1.0);
            assert_eq!(light.sky_color, 0xffffffff);
        }

        #[test]
        fn overrides_sky_and_ground_colors_from_options() {
            let light = create_hemisphere_light(&HemisphereLightOptions {
                ground_color: 0x000000ff,
                sky_color: 0x0000ffff,
                ..HemisphereLightOptions::default()
            });
            assert_eq!(light.ground_color, 0x000000ff);
            assert_eq!(light.sky_color, 0x0000ffff);
        }
    }

    mod get_hemisphere_light_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_hemisphere_light_kind(), get_hemisphere_light_kind());
        }
    }
}
