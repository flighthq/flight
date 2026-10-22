use flight_scene3d_wgpu::contract::*;

use crate::support::*;

mod ensure_wgpu_environment_source_cube {
    use super::*;

    #[test]
    fn returns_null_when_the_environment_has_no_complete_source_cube() {
        let mut test = make_wgpu_scene3d_state(None);
        let environment = flight_lighting::create_environment();
        assert!(ensure_wgpu_environment_source_cube(&mut test.state, &environment).is_none());
    }

    #[test]
    fn uploads_six_faces_into_a_cube_texture_and_caches_the_view() {
        let mut test = make_wgpu_scene3d_state(None);
        let (environment, fake) = create_test_image_environment();
        let view = ensure_wgpu_environment_source_cube(&mut test.state, &environment);
        assert!(view.is_some());
        assert_eq!(
            test.textures()[0].format,
            wgpu::TextureFormat::Rgba8UnormSrgb
        );
        assert_eq!(fake.copy_count(), 6);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .environment_source_cube
                .is_some()
        );
    }

    #[test]
    fn uploads_a_data_only_cube_through_queue_write_texture() {
        let mut test = make_wgpu_scene3d_state(None);
        let view =
            ensure_wgpu_environment_source_cube(&mut test.state, &create_test_bitmap_environment());
        assert!(view.is_some());
        let writes = test.texture_writes();
        assert_eq!(writes.len(), 6);
        // rgba8 data face: tightly-packed rows of width * 4 bytes, the bitmap's own bytes.
        assert_eq!(writes[0].bytes_per_row, Some(16));
        assert_eq!(writes[0].data.len(), 64);
        assert_eq!(writes[5].origin, [0, 0, 5]);
    }

    #[test]
    fn uses_a_linear_gpu_format_for_a_linear_source_cube() {
        let mut test = make_wgpu_scene3d_state(None);
        let face = create_test_bitmap_face();
        let environment = create_test_cube_environment(
            std::array::from_fn(|_| face.clone()),
            flight_texture::TextureColorSpace::Linear,
        );
        ensure_wgpu_environment_source_cube(&mut test.state, &environment);
        assert_eq!(test.textures()[0].format, wgpu::TextureFormat::Rgba8Unorm);
    }

    #[test]
    fn re_uses_the_cached_cube_view_without_re_uploading() {
        let mut test = make_wgpu_scene3d_state(None);
        let (environment, fake) = create_test_image_environment();
        let view = ensure_wgpu_environment_source_cube(&mut test.state, &environment);
        let uploads = fake.copy_count();
        let (other, other_fake) = create_test_image_environment();
        let again = ensure_wgpu_environment_source_cube(&mut test.state, &other);
        assert_eq!(again, view);
        assert_eq!(fake.copy_count(), uploads);
        assert_eq!(other_fake.copy_count(), 0);
    }
}

mod update_wgpu_environment_cube_face {
    use super::*;

    #[test]
    fn returns_false_when_no_source_cube_has_been_built_yet() {
        let mut test = make_wgpu_scene3d_state(None);
        let face = create_test_bitmap_face();
        assert!(!update_wgpu_environment_cube_face(
            &mut test.state,
            2,
            &*face.read().unwrap()
        ));
        assert_eq!(test.count("writeTexture"), 0);
    }

    #[test]
    fn restamps_a_single_face_of_the_built_cube_without_rebuilding_the_other_five() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_environment_source_cube(&mut test.state, &create_test_bitmap_environment());
        let after_build = test.count("writeTexture");
        assert_eq!(after_build, 6);
        let face = create_test_bitmap_face();
        assert!(update_wgpu_environment_cube_face(
            &mut test.state,
            2,
            &*face.read().unwrap()
        ));
        assert_eq!(test.count("writeTexture"), after_build + 1);
        assert_eq!(test.texture_writes().last().unwrap().origin, [0, 0, 2]);
    }
}
