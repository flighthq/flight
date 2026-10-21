use flight_texture::contract::*;

mod get_alpha_type_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(get_alpha_type_string(AlphaType::Opaque), "opaque");
        assert_eq!(
            get_alpha_type_string(AlphaType::Premultiplied),
            "premultiplied"
        );
        assert_eq!(get_alpha_type_string(AlphaType::Straight), "straight");
    }
}

mod get_pixel_format_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(
            get_pixel_format_string(PixelFormat::Bgra8Unorm),
            "bgra8unorm"
        );
        assert_eq!(
            get_pixel_format_string(PixelFormat::Rgba8Unorm),
            "rgba8unorm"
        );
    }
}

mod get_render_target_color_space_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(
            get_render_target_color_space_string(RenderTargetColorSpace::Linear),
            "linear"
        );
        assert_eq!(
            get_render_target_color_space_string(RenderTargetColorSpace::Srgb),
            "srgb"
        );
    }
}

mod get_texture_color_space_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(
            get_texture_color_space_string(TextureColorSpace::Linear),
            "linear"
        );
        assert_eq!(
            get_texture_color_space_string(TextureColorSpace::Srgb),
            "srgb"
        );
    }
}

mod get_texture_dimension_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(
            get_texture_dimension_string(TextureDimension::Texture2D),
            "2d"
        );
        assert_eq!(
            get_texture_dimension_string(TextureDimension::Texture2DArray),
            "2d-array"
        );
        assert_eq!(
            get_texture_dimension_string(TextureDimension::Texture3D),
            "3d"
        );
        assert_eq!(get_texture_dimension_string(TextureDimension::Cube), "cube");
    }
}

mod get_texture_filter_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(get_texture_filter_string(TextureFilter::Linear), "linear");
        assert_eq!(
            get_texture_filter_string(TextureFilter::LinearMipmapLinear),
            "linear-mipmap-linear"
        );
        assert_eq!(
            get_texture_filter_string(TextureFilter::LinearMipmapNearest),
            "linear-mipmap-nearest"
        );
        assert_eq!(get_texture_filter_string(TextureFilter::Nearest), "nearest");
        assert_eq!(
            get_texture_filter_string(TextureFilter::NearestMipmapLinear),
            "nearest-mipmap-linear"
        );
        assert_eq!(
            get_texture_filter_string(TextureFilter::NearestMipmapNearest),
            "nearest-mipmap-nearest"
        );
    }
}

mod get_texture_gamut_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(
            get_texture_gamut_string(TextureGamut::DisplayP3),
            "display-p3"
        );
        assert_eq!(get_texture_gamut_string(TextureGamut::Srgb), "srgb");
    }
}

mod get_texture_wrap_string {
    use super::*;
    #[test]
    fn maps_every_variant() {
        assert_eq!(
            get_texture_wrap_string(TextureWrap::ClampToEdge),
            "clamp-to-edge"
        );
        assert_eq!(
            get_texture_wrap_string(TextureWrap::MirrorRepeat),
            "mirror-repeat"
        );
        assert_eq!(get_texture_wrap_string(TextureWrap::Repeat), "repeat");
    }
}

mod parse_alpha_type {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(parse_alpha_type("opaque"), Some(AlphaType::Opaque));
        assert_eq!(parse_alpha_type("other"), None);
    }
}

mod parse_pixel_format {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_pixel_format("rgba8unorm"),
            Some(PixelFormat::Rgba8Unorm)
        );
        assert_eq!(parse_pixel_format("other"), None);
    }
}

mod parse_render_target_color_space {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_render_target_color_space("srgb"),
            Some(RenderTargetColorSpace::Srgb)
        );
        assert_eq!(parse_render_target_color_space("other"), None);
    }
}

mod parse_texture_color_space {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_texture_color_space("linear"),
            Some(TextureColorSpace::Linear)
        );
        assert_eq!(parse_texture_color_space("other"), None);
    }
}

mod parse_texture_dimension {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_texture_dimension("2d-array"),
            Some(TextureDimension::Texture2DArray)
        );
        assert_eq!(parse_texture_dimension("other"), None);
    }
}

mod parse_texture_filter {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_texture_filter("nearest-mipmap-linear"),
            Some(TextureFilter::NearestMipmapLinear)
        );
        assert_eq!(parse_texture_filter("other"), None);
    }
}

mod parse_texture_gamut {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_texture_gamut("display-p3"),
            Some(TextureGamut::DisplayP3)
        );
        assert_eq!(parse_texture_gamut("other"), None);
    }
}

mod parse_texture_wrap {
    use super::*;
    #[test]
    fn parses_exact_strings_and_rejects_unknown_values() {
        assert_eq!(parse_texture_wrap("repeat"), Some(TextureWrap::Repeat));
        assert_eq!(parse_texture_wrap("other"), None);
    }
}
