// flight-lint: allow-file(test-default-call) Compressed capability records intentionally use Rust defaults.
mod detect_gl_compressed_texture_support {
    use crate::gl_test_helper::{make_compressed_support, make_gl};
    use flight_render_gl::detect_gl_compressed_texture_support;
    #[test]
    fn reports_no_optional_formats_without_extensions() {
        assert_eq!(
            detect_gl_compressed_texture_support(&make_gl()),
            make_compressed_support()
        );
    }
}
mod get_gl_compressed_texture_format {
    use crate::gl_test_helper::make_gl;
    use flight_render_gl::get_gl_compressed_texture_format;
    use flight_texture_formats::TextureContainerFormat;
    #[test]
    fn returns_negative_one_for_unsupported_formats() {
        assert_eq!(
            get_gl_compressed_texture_format(&make_gl(), TextureContainerFormat::Bc1),
            -1
        );
    }
}
mod has_gl_compressed_texture_format {
    use flight_render_gl::has_gl_compressed_texture_format;
    use flight_texture_formats::TextureContainerFormat;
    #[test]
    fn maps_each_family_to_its_capability_bit() {
        let mut support = crate::gl_test_helper::make_compressed_support();
        support.s3tc = true;
        assert!(has_gl_compressed_texture_format(
            &support,
            TextureContainerFormat::Bc3
        ));
        assert!(!has_gl_compressed_texture_format(
            &support,
            TextureContainerFormat::Astc4x4
        ));
    }
}
mod register_gl_compressed_texture_decoder {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{GlCompressedTextureDecoder, register_gl_compressed_texture_decoder};
    use flight_texture_formats::TextureContainerFormat;
    fn decode(
        _format: TextureContainerFormat,
        width: u32,
        height: u32,
        _bytes: &[u8],
    ) -> Option<Vec<u8>> {
        Some(vec![0; width as usize * height as usize * 4])
    }
    #[test]
    fn stores_and_clears_the_decoder() {
        let mut state = make_state();
        register_gl_compressed_texture_decoder(
            &mut state,
            Some(decode as GlCompressedTextureDecoder),
        );
        assert!(state.gl_registries.compressed_texture_decoder.is_some());
        register_gl_compressed_texture_decoder(&mut state, None);
        assert!(state.gl_registries.compressed_texture_decoder.is_none());
    }
}
mod register_gl_compressed_texture_upload {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::register_gl_compressed_texture_upload;
    #[test]
    fn installs_the_standard_uploader_when_no_override_is_supplied() {
        let mut state = make_state();
        register_gl_compressed_texture_upload(&mut state, None);
        assert!(state.gl_registries.compressed_texture_upload.is_some());
        register_gl_compressed_texture_upload(&mut state, Some(()));
        assert!(state.gl_registries.compressed_texture_upload.is_none());
    }
}
mod upload_gl_compressed_texture_container {
    use crate::gl_test_helper::{calls_named, make_compressed_image_resource, make_gl};
    use flight_render_gl::upload_gl_compressed_texture_container;
    use flight_texture::TextureColorSpace;
    use flight_texture_formats::TextureContainerFormat;
    fn decode(
        _format: TextureContainerFormat,
        width: u32,
        height: u32,
        _bytes: &[u8],
    ) -> Option<Vec<u8>> {
        Some(vec![255; width as usize * height as usize * 4])
    }
    #[test]
    fn falls_back_to_rgba_decode_after_validating_ranges() {
        let gl = make_gl();
        let image = make_compressed_image_resource();
        let image = image.read().unwrap();
        let container = &image.compressed.container;
        let payload = image.compressed.payload.read().unwrap();
        assert!(upload_gl_compressed_texture_container(
            &gl,
            container,
            &payload,
            Some(decode),
            Some(TextureColorSpace::Srgb)
        ));
        assert_eq!(calls_named("tex_image_2d"), 1);
        let mut invalid = container.clone();
        invalid.levels[0].byte_length = 99;
        assert!(!upload_gl_compressed_texture_container(
            &gl,
            &invalid,
            &payload,
            Some(decode),
            None
        ));
    }
}
