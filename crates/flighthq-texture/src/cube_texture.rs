//! `CubeTexture` constructors and helpers.

use flighthq_types::{CubeTexture, ImageResource, Sampler, TextureColorSpace};

use crate::equals_image_binding;
use crate::sampler::{clone_sampler, copy_sampler, create_sampler, equals_sampler};

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

/// Copies every [`CubeTexture`] field from `source` into `out` in place. Each
/// face is copied by value (the Rust analogue of the TS shared reference); the
/// [`Sampler`] is copied into `out`'s existing sampler. Safe when `out` aliases
/// `source`: all input values are read into locals before any writes.
pub fn copy_cube_texture(out: &mut CubeTexture, source: &CubeTexture) {
    let color_space = source.color_space;
    let f0 = source.faces[0].clone();
    let f1 = source.faces[1].clone();
    let f2 = source.faces[2].clone();
    let f3 = source.faces[3].clone();
    let f4 = source.faces[4].clone();
    let f5 = source.faces[5].clone();
    let sampler = source.sampler;
    copy_sampler(&mut out.sampler, &sampler);
    out.color_space = color_space;
    out.faces[0] = f0;
    out.faces[1] = f1;
    out.faces[2] = f2;
    out.faces[3] = f3;
    out.faces[4] = f4;
    out.faces[5] = f5;
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

/// True when both cube textures describe identical state: same color space,
/// same sampler state, and the same face binding in every slot. Returns false
/// for absent (`None`) operands so callers can compare nullable references
/// directly.
pub fn equals_cube_texture(a: Option<&CubeTexture>, b: Option<&CubeTexture>) -> bool {
    let (a, b) = match (a, b) {
        (Some(a), Some(b)) => (a, b),
        _ => return false,
    };
    if a.color_space != b.color_space {
        return false;
    }
    if !equals_sampler(Some(&a.sampler), Some(&b.sampler)) {
        return false;
    }
    for i in 0..6 {
        if !equals_image_binding(&a.faces[i], &b.faces[i]) {
            return false;
        }
    }
    true
}

/// Returns the pixel size (width = height for a cube face) of the first
/// non-`None` face, or `-1` when no face is bound. Cube faces are assumed
/// square; width is used as the canonical face size.
pub fn get_cube_texture_face_size(cube: &CubeTexture) -> i64 {
    if let Some(face) = cube.faces.iter().flatten().next() {
        return face.width as i64;
    }
    -1
}

/// True when all six faces are bound (non-`None`). Materials and IBL pipelines
/// (skybox, reflections) gate sampling behind this; an incomplete cube is
/// treated as absent.
pub fn is_cube_texture_complete(cube: &CubeTexture) -> bool {
    cube.faces.iter().all(|face| face.is_some())
}

/// Assigns (or clears, with `None`) a single face image in place. Use the
/// `CUBE_FACE_*` constants from `flighthq-types` (`CUBE_FACE_POSITIVE_X` = 0,
/// `CUBE_FACE_NEGATIVE_X` = 1, `CUBE_FACE_POSITIVE_Y` = 2,
/// `CUBE_FACE_NEGATIVE_Y` = 3, `CUBE_FACE_POSITIVE_Z` = 4,
/// `CUBE_FACE_NEGATIVE_Z` = 5) instead of magic-number indices.
pub fn set_cube_texture_face(
    cube: &mut CubeTexture,
    face_index: usize,
    image: Option<ImageResource>,
) {
    cube.faces[face_index] = image;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sampler::equals_sampler;
    use flighthq_types::{CUBE_FACE_NEGATIVE_X, CUBE_FACE_POSITIVE_X, CUBE_FACE_POSITIVE_Y};

    fn fake_face() -> ImageResource {
        ImageResource {
            width: 64,
            height: 64,
            ..Default::default()
        }
    }

    fn fake_face2() -> ImageResource {
        ImageResource {
            width: 128,
            height: 128,
            ..Default::default()
        }
    }

    fn all_faces() -> [Option<ImageResource>; 6] {
        [
            Some(fake_face()),
            Some(fake_face()),
            Some(fake_face()),
            Some(fake_face()),
            Some(fake_face()),
            Some(fake_face()),
        ]
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
        assert_eq!(copy_face.width, 64);
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
        assert_eq!(face.width, 64);
    }

    #[test]
    fn copy_cube_texture_writes_every_field_into_a_distinct_out_preserving_sampler() {
        let source = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            faces: Some([Some(fake_face()), None, None, None, None, None]),
            ..Default::default()
        }));
        let mut out = create_cube_texture(None);

        copy_cube_texture(&mut out, &source);

        assert_eq!(out.color_space, TextureColorSpace::Linear);
        let out_face = out.faces[0].as_ref().expect("copy keeps face 0");
        assert_eq!(out_face.width, 64);
        assert!(equals_sampler(Some(&out.sampler), Some(&source.sampler)));
    }

    #[test]
    fn copy_cube_texture_is_safe_when_out_aliases_source() {
        let mut cube = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            faces: Some([Some(fake_face()), None, None, None, None, None]),
            ..Default::default()
        }));

        let snapshot = clone_cube_texture(&cube);
        copy_cube_texture(&mut cube, &snapshot);

        assert_eq!(cube.color_space, TextureColorSpace::Linear);
        assert!(cube.faces[0].is_some());
    }

    #[test]
    fn equals_cube_texture_is_true_for_same_color_space_sampler_and_faces() {
        let a = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            faces: Some(all_faces()),
            ..Default::default()
        }));
        let b = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            faces: Some(all_faces()),
            ..Default::default()
        }));

        assert!(equals_cube_texture(Some(&a), Some(&b)));
        assert!(equals_cube_texture(Some(&a), Some(&a)));
    }

    #[test]
    fn equals_cube_texture_is_false_when_color_space_differs() {
        let a = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            ..Default::default()
        }));
        let b = create_cube_texture(Some(&CubeTextureOptions {
            color_space: Some(TextureColorSpace::Srgb),
            ..Default::default()
        }));

        assert!(!equals_cube_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_cube_texture_is_false_when_a_face_differs() {
        let a = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some(all_faces()),
            ..Default::default()
        }));
        let mut b = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some(all_faces()),
            ..Default::default()
        }));
        b.faces[0] = Some(fake_face2());

        assert!(!equals_cube_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_cube_texture_is_false_when_the_sampler_differs() {
        let a = create_cube_texture(None);
        let b = create_cube_texture(Some(&CubeTextureOptions {
            sampler: Some(create_sampler(Some(&crate::sampler::SamplerOptions {
                mipmaps: Some(false),
                ..Default::default()
            }))),
            ..Default::default()
        }));

        assert!(!equals_cube_texture(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_cube_texture_is_false_for_absent_operands() {
        let a = create_cube_texture(None);

        assert!(!equals_cube_texture(Some(&a), None));
        assert!(!equals_cube_texture(None, Some(&a)));
        assert!(!equals_cube_texture(None, None));
    }

    #[test]
    fn get_cube_texture_face_size_returns_first_non_null_face_width() {
        let cube = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some([None, Some(fake_face()), None, None, None, None]),
            ..Default::default()
        }));

        assert_eq!(get_cube_texture_face_size(&cube), 64);
    }

    #[test]
    fn get_cube_texture_face_size_returns_minus_one_when_all_faces_null() {
        let cube = create_cube_texture(None);

        assert_eq!(get_cube_texture_face_size(&cube), -1);
    }

    #[test]
    fn is_cube_texture_complete_is_false_when_any_face_null() {
        let cube = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some([Some(fake_face()), None, None, None, None, None]),
            ..Default::default()
        }));

        assert!(!is_cube_texture_complete(&cube));
    }

    #[test]
    fn is_cube_texture_complete_is_true_when_all_six_faces_bound() {
        let cube = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some(all_faces()),
            ..Default::default()
        }));

        assert!(is_cube_texture_complete(&cube));
    }

    #[test]
    fn set_cube_texture_face_binds_a_face_using_a_named_constant() {
        let mut cube = create_cube_texture(None);

        set_cube_texture_face(&mut cube, CUBE_FACE_POSITIVE_X, Some(fake_face()));
        assert!(cube.faces[CUBE_FACE_POSITIVE_X].is_some());
        assert!(cube.faces[CUBE_FACE_NEGATIVE_X].is_none());
    }

    #[test]
    fn set_cube_texture_face_unbinds_a_face_when_passed_none() {
        let mut cube = create_cube_texture(Some(&CubeTextureOptions {
            faces: Some(all_faces()),
            ..Default::default()
        }));

        set_cube_texture_face(&mut cube, CUBE_FACE_POSITIVE_Y, None);
        assert!(cube.faces[CUBE_FACE_POSITIVE_Y].is_none());
    }
}
