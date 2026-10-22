mod upload_gl_texture_data {
    use crate::gl_test_helper::{last_call, make_gl};
    use flight_render_gl::upload_gl_texture_data;

    #[test]
    fn drives_the_raw_pixel_path_with_the_exact_rgba_arguments_and_payload() {
        let gl = make_gl();
        let data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        upload_gl_texture_data(&gl, glow::TEXTURE_2D, 2, 2, &data, None);
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
        assert_eq!(call.bytes, data);
    }
}
mod upload_gl_texture_element {
    use crate::gl_test_helper::{last_call, make_gl};
    use flight_render_gl::{GlImageSourceToken, upload_gl_texture_element};
    use std::sync::Arc;

    #[test]
    fn drives_the_native_element_equivalent_with_the_exact_source_pixels() {
        let gl = make_gl();
        let token = GlImageSourceToken {
            width: 2,
            height: 1,
            ready: true,
            pixels: Arc::new(vec![1, 2, 3, 4, 5, 6, 7, 8]),
        };
        upload_gl_texture_element(&gl, glow::TEXTURE_2D, &token, None);
        let call = last_call("tex_image_2d");
        assert_eq!(
            call.integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                0,
                i64::from(glow::RGBA),
                2,
                1,
                0,
                i64::from(glow::RGBA),
                i64::from(glow::UNSIGNED_BYTE),
                0,
            ]
        );
        assert_eq!(call.bytes.as_slice(), token.pixels.as_slice());
    }
}
mod upload_gl_texture_image_resource {
    use crate::gl_test_helper::{last_call, make_gl, make_image_resource};
    use flight_render_gl::upload_gl_texture_image_resource;

    #[test]
    fn takes_the_native_element_path_when_the_resource_carries_a_source() {
        let gl = make_gl();
        let image = make_image_resource(2, 2, true);
        assert!(
            upload_gl_texture_image_resource(&gl, glow::TEXTURE_2D, &image.read().unwrap(), None)
                .is_ok()
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
