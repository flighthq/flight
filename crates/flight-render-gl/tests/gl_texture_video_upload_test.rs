mod upload_gl_texture_video_frame {
    use std::sync::Arc;

    use crate::gl_test_helper::{calls_named, last_call, make_gl, make_image_resource};
    use flight_render_gl::upload_gl_texture_video_frame;

    #[test]
    fn skips_and_returns_the_old_version_when_the_element_has_no_decoded_frame() {
        let gl = make_gl();
        let image = make_image_resource(0, 0, false);
        image.write().unwrap().version = 1;
        let image = image.read().unwrap();
        assert_eq!(
            upload_gl_texture_video_frame(&gl, &image, u32::MAX, None),
            u32::MAX
        );
        assert_eq!(calls_named("tex_image_2d"), 0);
    }

    #[test]
    fn skips_and_returns_the_old_version_when_the_host_source_is_not_a_video_token() {
        let gl = make_gl();
        let source = Arc::new(flight_host::HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        });
        let image = flight_image::create_image_resource(
            source,
            &flight_image::create_image_resolver_state(),
        );
        image.write().unwrap().version = 2;
        let image = image.read().unwrap();
        assert_eq!(
            upload_gl_texture_video_frame(&gl, &image, u32::MAX, None),
            u32::MAX
        );
        assert_eq!(calls_named("tex_image_2d"), 0);
    }

    #[test]
    fn skips_the_upload_and_returns_the_same_id_when_the_frame_has_not_advanced() {
        let gl = make_gl();
        let image = make_image_resource(2, 2, true);
        image.write().unwrap().version = 5;
        let image = image.read().unwrap();
        assert_eq!(upload_gl_texture_video_frame(&gl, &image, 5, None), 5);
        assert_eq!(calls_named("tex_image_2d"), 0);
    }

    #[test]
    fn threads_an_explicit_srgb_internal_format_to_the_video_upload() {
        let gl = make_gl();
        let image = make_image_resource(2, 2, true);
        image.write().unwrap().version = 3;
        let image = image.read().unwrap();
        assert_eq!(
            upload_gl_texture_video_frame(&gl, &image, u32::MAX, Some(glow::SRGB8_ALPHA8)),
            3
        );
        let call = last_call("tex_image_2d");
        assert_eq!(call.integers[0], i64::from(glow::TEXTURE_2D));
        assert_eq!(call.integers[1], 0);
        assert_eq!(call.integers[2], i64::from(glow::SRGB8_ALPHA8));
        assert_eq!(call.integers[6], i64::from(glow::RGBA));
        assert_eq!(call.integers[7], i64::from(glow::UNSIGNED_BYTE));
        assert_eq!(call.bytes, vec![255; 16]);
    }

    #[test]
    fn uploads_the_element_and_returns_the_new_frame_id_when_the_frame_advanced() {
        let gl = make_gl();
        let image = make_image_resource(2, 2, true);
        image.write().unwrap().version = 3;
        let image = image.read().unwrap();
        assert_eq!(
            upload_gl_texture_video_frame(&gl, &image, u32::MAX, None),
            3
        );
        let call = last_call("tex_image_2d");
        assert_eq!(
            call.integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                0,
                i64::from(glow::RGBA),
                2,
                2,
                0,
                i64::from(glow::RGBA),
                i64::from(glow::UNSIGNED_BYTE),
                0,
            ]
        );
        assert_eq!(call.bytes, vec![255; 16]);
    }
}
