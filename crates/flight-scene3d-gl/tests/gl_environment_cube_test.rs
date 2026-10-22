use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_entity::Ref;
use flight_lighting::{Environment, create_environment};
use flight_scene3d_gl::contract::*;
use flight_texture::{
    Texture, TextureColorSpace, TextureSourceRef, TextureUvTransform, create_cube_texture,
};
use glow::NativeTexture;

use crate::gl_test_helper::{call_names, calls_with, count_calls, make_gl_scene3d_state};

// The GPU upload + sampling is validated by the functional `env-skybox` capture (the mock has no real
// cubemap). These cover the CPU-side guards: the face-target arithmetic, the "no complete cube" sentinel
// path that callers depend on to no-op, and the data-only face upload path.

fn data_face(size: u32) -> TextureSourceRef {
    return Arc::new(RwLock::new(create_bitmap(size, size, None)));
}

fn data_only_environment(size: u32) -> (Environment, Ref<Texture>) {
    let face = data_face(size);
    let mut cube = create_cube_texture();
    cube.texture_fields_mut().color_space = TextureColorSpace::Srgb;
    cube.sources = std::array::from_fn(|_| Some(face.clone()));
    let texture: Ref<Texture> = Arc::new(RwLock::new(Texture::Cube(cube)));
    let mut environment = create_environment();
    environment.environment = Some(texture.clone());
    environment.intensity = 1.0;
    return (environment, texture);
}

fn empty_environment() -> Environment {
    let mut environment = create_environment();
    environment.environment = None;
    environment.intensity = 1.0;
    return environment;
}

fn texture_name(texture: NativeTexture) -> i64 {
    return i64::from(texture.0.get());
}

fn cube_face(texture: &Ref<Texture>, face: usize) -> TextureSourceRef {
    let guard = texture.read().unwrap();
    let Texture::Cube(cube) = &*guard else {
        panic!("expected a cube texture");
    };
    return cube.sources[face].clone().unwrap();
}

mod destroy_gl_environment_source_cube {
    use super::*;

    #[test]
    fn is_a_no_op_when_nothing_is_cached() {
        let state = make_gl_scene3d_state();
        let before = call_names().len();
        destroy_gl_environment_source_cube(&state);
        assert_eq!(call_names().len(), before);
    }

    #[test]
    fn frees_the_cached_cube_and_clears_the_cache_so_the_next_ensure_uploads_again() {
        let state = make_gl_scene3d_state();
        let (environment, _) = data_only_environment(4);
        let first = ensure_gl_environment_source_cube(&state, &environment);
        assert!(first.is_some());
        // Identity caching is the whole reason this verb has to exist: without dropping the cache, a
        // caller that changes the cube keeps rendering the first one forever.
        assert_eq!(ensure_gl_environment_source_cube(&state, &environment), first);

        destroy_gl_environment_source_cube(&state);
        let deleted: Vec<i64> = calls_with("delete_textures")
            .into_iter()
            .flat_map(|call| call.integers)
            .collect();
        assert!(deleted.contains(&texture_name(first.unwrap())));

        // That a SECOND upload happened is the actual claim — the cache was dropped rather than reused.
        let uploads_before = count_calls("gen_textures");
        assert!(ensure_gl_environment_source_cube(&state, &environment).is_some());
        assert_eq!(count_calls("gen_textures"), uploads_before + 1);
    }

    #[test]
    fn clears_the_colour_space_with_the_cube_it_belonged_to() {
        let state = make_gl_scene3d_state();
        ensure_gl_environment_source_cube(&state, &data_only_environment(4).0);
        assert_eq!(
            get_gl_scene3d_runtime(&state).environment_source_cube_color_space,
            TextureColorSpace::Srgb
        );
        destroy_gl_environment_source_cube(&state);
        // Left behind, it would pick the internal format for a face restamped onto the NEXT cube.
        assert_eq!(
            get_gl_scene3d_runtime(&state).environment_source_cube_color_space,
            TextureColorSpace::Linear
        );
    }

    #[test]
    fn advances_the_source_revision_so_an_existing_ibl_bake_becomes_stale() {
        let state = make_gl_scene3d_state();
        ensure_gl_environment_source_cube(&state, &data_only_environment(4).0);
        let before = get_gl_scene3d_runtime(&state).environment_source_revision;
        destroy_gl_environment_source_cube(&state);
        assert_eq!(
            get_gl_scene3d_runtime(&state).environment_source_revision,
            before.wrapping_add(1)
        );
    }
}

mod ensure_gl_environment_source_cube {
    use super::*;

    #[test]
    fn returns_null_when_the_environment_has_no_source_cube() {
        let state = make_gl_scene3d_state();
        assert_eq!(ensure_gl_environment_source_cube(&state, &empty_environment()), None);
    }

    #[test]
    fn uploads_a_data_only_cube_through_the_raw_pixel_tex_image_2d_overload() {
        let state = make_gl_scene3d_state();
        let (environment, _) = data_only_environment(4);
        let texture = ensure_gl_environment_source_cube(&state, &environment);
        assert!(texture.is_some());
        let uploads = calls_with("tex_image_2d");
        assert_eq!(uploads.len(), 6);
        // The raw-pixel upload passes width/height and the data buffer (not a null pointer).
        for upload in uploads {
            assert_eq!(upload.integers[2], i64::from(glow::SRGB8_ALPHA8));
            assert_eq!(upload.integers[3], 4);
            assert_eq!(upload.integers[4], 4);
            assert_eq!(upload.integers[8], 0);
            assert_eq!(upload.bytes.len(), 4 * 4 * 4);
        }
    }

    #[test]
    fn uses_a_linear_internal_format_for_a_linear_source_cube() {
        let state = make_gl_scene3d_state();
        let (environment, texture) = data_only_environment(4);
        texture.write().unwrap().texture_fields_mut().color_space = TextureColorSpace::Linear;
        ensure_gl_environment_source_cube(&state, &environment);
        assert!(
            calls_with("tex_image_2d")
                .iter()
                .all(|call| call.integers[2] == i64::from(glow::RGBA))
        );
    }

    #[test]
    fn replaces_the_cached_upload_when_the_cube_texture_identity_changes() {
        let state = make_gl_scene3d_state();
        ensure_gl_environment_source_cube(&state, &data_only_environment(4).0);
        let uploads_before = count_calls("tex_image_2d");

        ensure_gl_environment_source_cube(&state, &data_only_environment(8).0);

        assert_eq!(count_calls("delete_textures"), 1);
        assert_eq!(count_calls("tex_image_2d"), uploads_before + 6);
    }

    #[test]
    fn replaces_the_cached_upload_when_the_cube_texture_version_changes() {
        let state = make_gl_scene3d_state();
        let (environment, texture) = data_only_environment(4);
        ensure_gl_environment_source_cube(&state, &environment);
        texture.write().unwrap().texture_fields_mut().version += 1;
        ensure_gl_environment_source_cube(&state, &environment);
        assert_eq!(count_calls("delete_textures"), 1);
    }

    #[test]
    fn replaces_the_cached_upload_when_a_shared_face_payload_version_changes() {
        let state = make_gl_scene3d_state();
        let (environment, texture) = data_only_environment(4);
        ensure_gl_environment_source_cube(&state, &environment);
        cube_face(&texture, 0)
            .write()
            .unwrap()
            .texture_source_fields_mut()
            .version += 1;
        ensure_gl_environment_source_cube(&state, &environment);
        assert_eq!(count_calls("delete_textures"), 1);
    }

    #[test]
    fn reuses_a_shared_cube_when_only_the_environment_identity_and_intensity_change() {
        let state = make_gl_scene3d_state();
        let (first, texture) = data_only_environment(4);
        ensure_gl_environment_source_cube(&state, &first);
        let created_before = count_calls("gen_textures");

        let mut second = create_environment();
        second.environment = Some(texture);
        second.intensity = 3.0;
        ensure_gl_environment_source_cube(&state, &second);

        assert_eq!(count_calls("gen_textures"), created_before);
        assert_eq!(count_calls("delete_textures"), 0);
    }

    #[test]
    fn drops_a_prior_cached_cube_when_the_next_environment_has_no_complete_source() {
        let state = make_gl_scene3d_state();
        ensure_gl_environment_source_cube(&state, &data_only_environment(4).0);
        assert_eq!(ensure_gl_environment_source_cube(&state, &empty_environment()), None);
        assert_eq!(count_calls("delete_textures"), 1);
        assert!(get_gl_scene3d_runtime(&state).environment_source_texture.is_none());
    }
}

mod get_gl_cube_face_target {
    use super::*;

    #[test]
    fn maps_face_index_onto_texture_cube_map_positive_x_plus_face() {
        let state = make_gl_scene3d_state();
        assert_eq!(get_gl_cube_face_target(&state.gl, 0), 0x8515);
        assert_eq!(get_gl_cube_face_target(&state.gl, 5), 0x851a);
    }
}

mod update_gl_environment_cube_face {
    use super::*;

    #[test]
    fn returns_false_when_no_source_cube_has_been_built_yet() {
        let state = make_gl_scene3d_state();
        assert!(!update_gl_environment_cube_face(&state, 2, &data_face(4)));
        assert_eq!(count_calls("tex_image_2d"), 0);
    }

    #[test]
    fn restamps_a_single_face_of_the_built_cube_without_rebuilding_the_other_five() {
        let state = make_gl_scene3d_state();
        ensure_gl_environment_source_cube(&state, &data_only_environment(4).0);
        let after_build = count_calls("tex_image_2d");
        assert_eq!(after_build, 6);
        assert!(update_gl_environment_cube_face(&state, 2, &data_face(4)));
        assert_eq!(count_calls("tex_image_2d"), after_build + 1);
    }

    #[test]
    fn advances_the_source_revision_so_baked_lighting_cannot_silently_sample_the_old_face() {
        let state = make_gl_scene3d_state();
        let (environment, texture) = data_only_environment(4);
        ensure_gl_environment_source_cube(&state, &environment);
        let before = get_gl_scene3d_runtime(&state).environment_source_revision;
        assert!(update_gl_environment_cube_face(&state, 2, &cube_face(&texture, 2)));
        assert_eq!(
            get_gl_scene3d_runtime(&state).environment_source_revision,
            before.wrapping_add(1)
        );
    }
}
