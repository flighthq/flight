use std::sync::Arc;

use flight_texture::contract::*;

use crate::source;

fn all_faces() -> TextureSourceCubeFaces {
    let face = source("image", 64, 64);
    return std::array::from_fn(|_| Some(face.clone()));
}

mod clone_cube_texture {
    use super::*;

    #[test]
    fn shares_faces_but_deep_clones_sampling_state() {
        let face = source("image", 64, 64);
        let cube = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            sampler: None,
            sources: Some([Some(face.clone()), None, None, None, None, None]),
        }));
        let mut copy = clone_cube_texture(&cube);
        assert_eq!(copy.color_space, TextureColorSpace::Linear);
        assert!(Arc::ptr_eq(copy.sources[0].as_ref().unwrap(), &face));
        assert!(equals_sampler(Some(&copy.sampler), Some(&cube.sampler)));
        copy.sampler.anisotropy = 8.0;
        assert_eq!(cube.sampler.anisotropy, 1.0);
    }
}

mod copy_cube_texture {
    use super::*;

    #[test]
    fn copies_fields_while_preserving_out_subentity_storage() {
        let source_cube = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            sampler: Some(create_anisotropic_sampler(8.0)),
            sources: Some(all_faces()),
        }));
        let mut out = create_cube_texture(None);
        let sampler_runtime = flight_entity::get_entity_uid(&mut out.sampler);
        copy_cube_texture(&mut out, &source_cube);
        assert!(equals_cube_texture(Some(&out), Some(&source_cube)));
        assert_eq!(
            flight_entity::get_entity_uid(&mut out.sampler),
            sampler_runtime
        );
    }
}

mod create_cube_texture {
    use super::*;

    #[test]
    fn creates_six_ordered_nullable_faces_and_fresh_sampling_state() {
        let first = source("positive-x", 1, 1);
        let second = source("negative-x", 2, 2);
        let cube = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: None,
            sampler: None,
            sources: Some([
                Some(first.clone()),
                Some(second.clone()),
                None,
                None,
                None,
                None,
            ]),
        }));
        assert_eq!(cube.sources.len(), 6);
        assert!(Arc::ptr_eq(
            cube.sources[CUBE_FACE_POSITIVE_X].as_ref().unwrap(),
            &first,
        ));
        assert!(Arc::ptr_eq(
            cube.sources[CUBE_FACE_NEGATIVE_X].as_ref().unwrap(),
            &second,
        ));
        assert_eq!(cube.color_space, TextureColorSpace::Srgb);
        assert!(cube.sources[CUBE_FACE_POSITIVE_Y].is_none());
        assert!(cube.sources[CUBE_FACE_NEGATIVE_Y].is_none());
        assert!(cube.sources[CUBE_FACE_POSITIVE_Z].is_none());
        assert!(cube.sources[CUBE_FACE_NEGATIVE_Z].is_none());
    }
}

mod equals_cube_texture {
    use super::*;

    #[test]
    fn requires_the_same_face_identities_and_sampling_values() {
        let faces = all_faces();
        let a = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            sampler: None,
            sources: Some(faces.clone()),
        }));
        let b = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            sampler: None,
            sources: Some(faces),
        }));
        assert!(equals_cube_texture(Some(&a), Some(&b)));
        let other = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            sampler: None,
            sources: Some(all_faces()),
        }));
        assert!(!equals_cube_texture(Some(&a), Some(&other)));
        assert!(!equals_cube_texture(Some(&a), None));
    }
}

mod get_cube_texture_face_size {
    use super::*;

    #[test]
    fn returns_the_first_bound_face_width_or_negative_one() {
        assert_eq!(get_cube_texture_face_size(&create_cube_texture(None)), -1);
        let cube = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: None,
            sampler: None,
            sources: Some([None, Some(source("image", 128, 64)), None, None, None, None]),
        }));
        assert_eq!(get_cube_texture_face_size(&cube), 128);
    }
}

mod is_cube_texture_complete {
    use super::*;

    #[test]
    fn requires_all_six_faces() {
        assert!(!is_cube_texture_complete(&create_cube_texture(None)));
        let cube = create_cube_texture(Some(&CreateCubeTextureOptions {
            color_space: None,
            sampler: None,
            sources: Some(all_faces()),
        }));
        assert!(is_cube_texture_complete(&cube));
    }
}

mod set_cube_texture_face {
    use super::*;

    #[test]
    fn binds_and_clears_named_slots_with_wrapping_versions() {
        let face = source("image", 64, 64);
        let mut cube = create_cube_texture(None);
        cube.version = u32::MAX;
        set_cube_texture_face(&mut cube, CUBE_FACE_POSITIVE_Z, Some(face.clone()));
        assert!(Arc::ptr_eq(
            cube.sources[CUBE_FACE_POSITIVE_Z].as_ref().unwrap(),
            &face,
        ));
        assert_eq!(cube.version, 0);
        set_cube_texture_face(&mut cube, CUBE_FACE_POSITIVE_Z, Some(face));
        assert_eq!(cube.version, 0);
        set_cube_texture_face(&mut cube, CUBE_FACE_POSITIVE_Z, None);
        assert_eq!(cube.version, 1);
    }
}
