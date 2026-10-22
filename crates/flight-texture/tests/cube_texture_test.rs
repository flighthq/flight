use std::sync::Arc;

use flight_texture::contract::*;

use crate::source;

fn all_faces() -> TextureSourceCubeFaces {
    let face = source("image", 64, 64);
    return std::array::from_fn(|_| Some(face.clone()));
}

fn cube_with(
    color_space: TextureColorSpace,
    sampler: Option<Sampler>,
    sources: TextureSourceCubeFaces,
) -> CubeTexture {
    let mut cube = create_cube_texture();
    cube.color_space = color_space;
    if let Some(sampler) = sampler {
        cube.sampler = sampler;
    }
    cube.sources = sources;
    return cube;
}

mod clone_cube_texture {
    use super::*;

    #[test]
    fn shares_faces_but_deep_clones_sampling_state() {
        let face = source("image", 64, 64);
        let cube = cube_with(
            TextureColorSpace::Linear,
            None,
            [Some(face.clone()), None, None, None, None, None],
        );
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
        let source_cube = cube_with(
            TextureColorSpace::Linear,
            Some(create_anisotropic_sampler(8.0)),
            all_faces(),
        );
        let mut out = create_cube_texture();
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
    fn establishes_defaults_before_caller_authored_assignment() {
        let first = source("positive-x", 1, 1);
        let second = source("negative-x", 2, 2);
        let mut cube = create_cube_texture();
        assert_eq!(cube.sources.len(), 6);
        assert_eq!(cube.color_space, TextureColorSpace::Srgb);
        assert!(cube.sources.iter().all(Option::is_none));

        cube.sources = [
            Some(first.clone()),
            Some(second.clone()),
            None,
            None,
            None,
            None,
        ];
        assert!(Arc::ptr_eq(
            cube.sources[CUBE_FACE_POSITIVE_X].as_ref().unwrap(),
            &first,
        ));
        assert!(Arc::ptr_eq(
            cube.sources[CUBE_FACE_NEGATIVE_X].as_ref().unwrap(),
            &second,
        ));
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
        let a = cube_with(TextureColorSpace::Linear, None, faces.clone());
        let b = cube_with(TextureColorSpace::Linear, None, faces);
        assert!(equals_cube_texture(Some(&a), Some(&b)));
        let other = cube_with(TextureColorSpace::Linear, None, all_faces());
        assert!(!equals_cube_texture(Some(&a), Some(&other)));
        assert!(!equals_cube_texture(Some(&a), None));
    }
}

mod get_cube_texture_face_size {
    use super::*;

    #[test]
    fn returns_the_first_bound_face_width_or_negative_one() {
        assert_eq!(get_cube_texture_face_size(&create_cube_texture()), -1);
        let cube = cube_with(
            TextureColorSpace::Srgb,
            None,
            [None, Some(source("image", 128, 64)), None, None, None, None],
        );
        assert_eq!(get_cube_texture_face_size(&cube), 128);
    }
}

mod initialize_cube_texture {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut cube = cube_with(
            TextureColorSpace::Linear,
            Some(create_anisotropic_sampler(8.0)),
            all_faces(),
        );
        cube.flip_x = true;
        cube.version = 7;
        let uid = flight_entity::get_entity_uid(&mut cube);
        initialize_cube_texture(&mut cube);
        assert_eq!(cube.color_space, TextureColorSpace::Srgb);
        assert!(!cube.flip_x);
        assert_eq!(cube.version, 0);
        assert!(cube.sources.iter().all(Option::is_none));
        assert_eq!(flight_entity::get_entity_uid(&mut cube), uid);
    }
}

mod is_cube_texture_complete {
    use super::*;

    #[test]
    fn requires_all_six_faces() {
        assert!(!is_cube_texture_complete(&create_cube_texture()));
        let cube = cube_with(TextureColorSpace::Srgb, None, all_faces());
        assert!(is_cube_texture_complete(&cube));
    }
}

mod set_cube_texture_face {
    use super::*;

    #[test]
    fn binds_and_clears_named_slots_with_wrapping_versions() {
        let face = source("image", 64, 64);
        let mut cube = create_cube_texture();
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
