//! `AmbientLight` constructor and kind.

use flighthq_types::{AmbientLight, KindId};

/// Options for [`create_ambient_light`]. Mirrors the TS `AmbientLightOptions`:
/// every field is optional with a default applied at construction.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct AmbientLightOptions {
    pub color: u32,
    pub intensity: f32,
}

impl Default for AmbientLightOptions {
    fn default() -> Self {
        Self {
            color: 0xffffffff,
            intensity: 1.0,
        }
    }
}

/// Marker type backing the stable [`KindId`] for ambient lights.
pub struct AmbientLightKindId;

/// Returns the stable [`KindId`] for ambient lights.
pub fn get_ambient_light_kind() -> KindId {
    KindId::of::<AmbientLightKindId>()
}

/// Independent copy of an ambient light's data.
pub fn clone_ambient_light(source: &AmbientLight) -> AmbientLight {
    create_ambient_light(&AmbientLightOptions {
        color: source.color,
        intensity: source.intensity,
    })
}

/// Uniform omnidirectional fill light. Color is packed sRGB-albedo RGBA
/// (`0xrrggbbaa`); defaults to opaque white at unit intensity. Ambient lights do
/// not cast shadows.
pub fn create_ambient_light(options: &AmbientLightOptions) -> AmbientLight {
    AmbientLight {
        color: options.color,
        intensity: options.intensity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod clone_ambient_light {
        use super::*;

        #[test]
        fn creates_an_independent_copy_with_the_same_fields() {
            let light = create_ambient_light(&AmbientLightOptions {
                color: 0x112233ff,
                intensity: 0.5,
            });
            let copy = clone_ambient_light(&light);
            assert_eq!(copy.color, 0x112233ff);
            assert_eq!(copy.intensity, 0.5);
        }
    }

    mod create_ambient_light {
        use super::*;

        #[test]
        fn applies_opaque_white_defaults_at_unit_intensity() {
            let light = create_ambient_light(&AmbientLightOptions::default());
            assert_eq!(light.color, 0xffffffff);
            assert_eq!(light.intensity, 1.0);
        }

        #[test]
        fn overrides_color_and_intensity_from_options() {
            let light = create_ambient_light(&AmbientLightOptions {
                color: 0x00ff00ff,
                intensity: 2.0,
            });
            assert_eq!(light.color, 0x00ff00ff);
            assert_eq!(light.intensity, 2.0);
        }
    }

    mod get_ambient_light_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_ambient_light_kind(), get_ambient_light_kind());
        }
    }
}
