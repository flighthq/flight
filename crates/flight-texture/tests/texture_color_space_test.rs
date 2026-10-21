use flight_texture::contract::*;

mod get_texture_sample_color_space {
    use super::*;

    #[test]
    fn selects_the_sample_transfer_function_from_both_spaces() {
        assert_eq!(
            get_texture_sample_color_space(TextureColorSpace::Srgb, RenderTargetColorSpace::Linear),
            TextureColorSpace::Srgb,
        );
        assert_eq!(
            get_texture_sample_color_space(
                TextureColorSpace::Linear,
                RenderTargetColorSpace::Linear
            ),
            TextureColorSpace::Linear,
        );
    }
}

mod should_decode_texture_on_sample {
    use super::*;

    #[test]
    fn decodes_only_srgb_content_in_linear_working_space() {
        assert!(should_decode_texture_on_sample(
            TextureColorSpace::Srgb,
            RenderTargetColorSpace::Linear,
        ));
        assert!(!should_decode_texture_on_sample(
            TextureColorSpace::Srgb,
            RenderTargetColorSpace::Srgb,
        ));
        assert!(!should_decode_texture_on_sample(
            TextureColorSpace::Linear,
            RenderTargetColorSpace::Linear,
        ));
        assert!(!should_decode_texture_on_sample(
            TextureColorSpace::Linear,
            RenderTargetColorSpace::Srgb,
        ));
    }
}

mod should_premultiply_texture_on_upload {
    use super::*;

    #[test]
    fn is_the_exact_inverse_of_decode_on_sample() {
        for source in [TextureColorSpace::Linear, TextureColorSpace::Srgb] {
            for working in [RenderTargetColorSpace::Linear, RenderTargetColorSpace::Srgb] {
                assert_eq!(
                    should_premultiply_texture_on_upload(source, working),
                    !should_decode_texture_on_sample(source, working),
                );
            }
        }
    }
}
