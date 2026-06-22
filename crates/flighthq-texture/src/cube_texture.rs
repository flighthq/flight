//! `CubeTexture` constructors and helpers.

use flighthq_types::{CubeTexture, ImageResource, Sampler, TextureColorSpace};

use crate::sampler::{clone_sampler, create_sampler};

/// Partial overrides for [`create_cube_texture`], mirroring the TS
/// `Readonly<Partial<CubeTextureLike>>` constructor argument. Each `None` field
/// keeps the default.
#[derive(Clone, Default)]
pub struct CubeTextureOptions {
    pub color_space: Option<TextureColorSpace>,
    pub faces: Option<[Option<ImageResource>; 6]>,
    pub sampler: Option<Sampler>,
}

/// Allocates an independent [`CubeTexture`] over the SAME six face pixels: each
/// [`ImageResource`] is cloned by value (the Rust analogue of the TS shared
/// reference) into a fresh `faces` array, so reassigning a face on the clone
/// does not touch the source; the [`Sampler`] is deep-cloned so the cubes
/// sample independently.
pub fn clone_cube_texture(source: &CubeTexture) -> CubeTexture {
    CubeTexture {
        color_space: source.color_space,
        faces: source.faces.clone(),
        sampler: clone_sampler(&source.sampler),
    }
}

/// Builds a [`CubeTexture`]: six unbound faces (all `None`, in the canonical
/// `+X, -X, +Y, -Y, +Z, -Z` order), a default [`Sampler`], and `Srgb` color
/// space (the environment-radiance default). Pass [`CubeTextureOptions`] to
/// override any of these; a supplied `faces` array is copied.
pub fn create_cube_texture(opts: Option<&CubeTextureOptions>) -> CubeTexture {
    CubeTexture {
        color_space: opts
            .and_then(|o| o.color_space)
            .unwrap_or(TextureColorSpace::Srgb),
        faces: opts
            .and_then(|o| o.faces.clone())
            .unwrap_or([None, None, None, None, None, None]),
        sampler: opts
            .and_then(|o| o.sampler.as_ref())
            .map(clone_sampler)
            .unwrap_or_else(|| create_sampler(None)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sampler::equals_sampler;

    fn fake_face() -> ImageResource {
        ImageResource {
            width: 2,
            height: 2,
            ..Default::default()
        }
    }

    #[test]
    fn clone_cube_texture_shares_the_face_values_in_a_fresh_array_and_deep_clones_the_sampler() {
        let source = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            faces: Some([Some(fake_face()), None, None, None, None, None]),
            ..Default::default()
        }));

        let mut copy = clone_cube_texture(&source);

        assert_eq!(copy.color_space, TextureColorSpace::Linear);
        let copy_face = copy.faces[0].as_ref().expect("clone keeps face 0");
        assert_eq!(copy_face.width, 2);
        assert!(equals_sampler(Some(&copy.sampler), Some(&source.sampler)));

        // A fresh faces array means reassigning a face on the clone cannot reach the source.
        copy.faces[1] = Some(fake_face());
        assert!(source.faces[1].is_none());
    }

    #[test]
    fn create_cube_texture_applies_the_default_six_unbound_faces_srgb_default_sampler() {
        let cube = create_cube_texture(None);

        assert_eq!(cube.faces.len(), 6);
        assert!(cube.faces.iter().all(|face| face.is_none()));
        assert_eq!(cube.color_space, TextureColorSpace::Srgb);
        assert!(equals_sampler(
            Some(&cube.sampler),
            Some(&create_sampler(None))
        ));
    }

    #[test]
    fn create_cube_texture_copies_a_supplied_faces_array_rather_than_aliasing_it() {
        let faces = [Some(fake_face()), None, None, None, None, None];
        let cube = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some(faces),
            ..Default::default()
        }));

        let face = cube.faces[0].as_ref().expect("face 0 set");
        assert_eq!(face.width, 2);
    }
}
