//! `Environment` (image-based lighting + skybox) constructor and kind.

use flighthq_types::{CubeTexture, Environment, KindId};

/// Options for [`create_environment`]. Mirrors the TS `EnvironmentOptions`:
/// every field is optional with a default applied at construction.
#[derive(Clone, Debug)]
pub struct EnvironmentOptions {
    pub environment: Option<CubeTexture>,
    pub intensity: f32,
}

impl Default for EnvironmentOptions {
    fn default() -> Self {
        Self {
            environment: None,
            intensity: 1.0,
        }
    }
}

/// Marker type backing the stable [`KindId`] for environments.
pub struct EnvironmentKindId;

/// Returns the stable [`KindId`] for environments.
pub fn get_environment_kind() -> KindId {
    KindId::of::<EnvironmentKindId>()
}

/// Independent copy of the environment's data. The `environment` cubemap is
/// carried over; in the Rust port a `CubeTexture` is a value type (`Clone`), so
/// the copy holds an equal cubemap value rather than a shared GPU handle as in
/// the TS reference-sharing semantics.
pub fn clone_environment(source: &Environment) -> Environment {
    create_environment(&EnvironmentOptions {
        environment: source.environment.clone(),
        intensity: source.intensity,
    })
}

/// Image-based environment lighting + skybox source. `environment` is the
/// radiance cubemap used for the skybox and as the IBL specular/irradiance
/// source; `intensity` scales its contribution. Defaults to no cubemap (`None`)
/// at unit intensity.
pub fn create_environment(options: &EnvironmentOptions) -> Environment {
    Environment {
        environment: options.environment.clone(),
        intensity: options.intensity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{CubeTexture, Sampler, TextureColorSpace, TextureFilter, TextureWrap};

    fn create_test_cube_texture() -> CubeTexture {
        let sampler = Sampler {
            anisotropy: 1.0,
            mag_filter: TextureFilter::Linear,
            min_filter: TextureFilter::Linear,
            mipmaps: false,
            wrap_u: TextureWrap::ClampToEdge,
            wrap_v: TextureWrap::ClampToEdge,
        };
        CubeTexture {
            color_space: TextureColorSpace::Linear,
            faces: [None, None, None, None, None, None],
            sampler,
        }
    }

    mod clone_environment {
        use super::*;

        #[test]
        fn creates_an_independent_copy_that_carries_the_cubemap() {
            let cube = create_test_cube_texture();
            let environment = create_environment(&EnvironmentOptions {
                environment: Some(cube),
                intensity: 0.5,
            });
            let copy = clone_environment(&environment);
            let cube = copy.environment.expect("cubemap should be carried over");
            assert_eq!(cube.color_space, TextureColorSpace::Linear);
            assert!(cube.faces.iter().all(|face| face.is_none()));
            assert_eq!(copy.intensity, 0.5);
        }
    }

    mod create_environment {
        use super::*;

        #[test]
        fn applies_defaults_no_cubemap_at_unit_intensity() {
            let environment = create_environment(&EnvironmentOptions::default());
            assert!(environment.environment.is_none());
            assert_eq!(environment.intensity, 1.0);
        }

        #[test]
        fn stores_the_supplied_cubemap_and_intensity() {
            let cube = create_test_cube_texture();
            let environment = create_environment(&EnvironmentOptions {
                environment: Some(cube),
                intensity: 2.0,
            });
            assert!(environment.environment.is_some());
            assert_eq!(environment.intensity, 2.0);
        }
    }

    mod get_environment_kind {
        use super::*;

        #[test]
        fn is_stable_across_calls() {
            assert_eq!(get_environment_kind(), get_environment_kind());
        }
    }
}
