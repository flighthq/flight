use crate::types::*;

// flight-lint: allow-file(conform-extra) D9 enum-string conversions for reviewed texture-owned TS string unions

pub fn get_alpha_type_string(value: AlphaType) -> &'static str {
    return match value {
        AlphaType::Opaque => "opaque",
        AlphaType::Premultiplied => "premultiplied",
        AlphaType::Straight => "straight",
    };
}

pub fn get_pixel_format_string(value: PixelFormat) -> &'static str {
    return match value {
        PixelFormat::Bgra8Unorm => "bgra8unorm",
        PixelFormat::Rgba8Unorm => "rgba8unorm",
    };
}

pub fn get_render_target_color_space_string(value: RenderTargetColorSpace) -> &'static str {
    return match value {
        RenderTargetColorSpace::Linear => "linear",
        RenderTargetColorSpace::Srgb => "srgb",
    };
}

pub fn get_texture_color_space_string(value: TextureColorSpace) -> &'static str {
    return match value {
        TextureColorSpace::Linear => "linear",
        TextureColorSpace::Srgb => "srgb",
    };
}

pub fn get_texture_dimension_string(value: TextureDimension) -> &'static str {
    return match value {
        TextureDimension::Texture2D => "2d",
        TextureDimension::Texture2DArray => "2d-array",
        TextureDimension::Texture3D => "3d",
        TextureDimension::Cube => "cube",
    };
}

pub fn get_texture_filter_string(value: TextureFilter) -> &'static str {
    return match value {
        TextureFilter::Linear => "linear",
        TextureFilter::LinearMipmapLinear => "linear-mipmap-linear",
        TextureFilter::LinearMipmapNearest => "linear-mipmap-nearest",
        TextureFilter::Nearest => "nearest",
        TextureFilter::NearestMipmapLinear => "nearest-mipmap-linear",
        TextureFilter::NearestMipmapNearest => "nearest-mipmap-nearest",
    };
}

pub fn get_texture_gamut_string(value: TextureGamut) -> &'static str {
    return match value {
        TextureGamut::DisplayP3 => "display-p3",
        TextureGamut::Srgb => "srgb",
    };
}

pub fn get_texture_wrap_string(value: TextureWrap) -> &'static str {
    return match value {
        TextureWrap::ClampToEdge => "clamp-to-edge",
        TextureWrap::MirrorRepeat => "mirror-repeat",
        TextureWrap::Repeat => "repeat",
    };
}

pub fn parse_alpha_type(value: &str) -> Option<AlphaType> {
    return match value {
        "opaque" => Some(AlphaType::Opaque),
        "premultiplied" => Some(AlphaType::Premultiplied),
        "straight" => Some(AlphaType::Straight),
        _ => None,
    };
}

pub fn parse_pixel_format(value: &str) -> Option<PixelFormat> {
    return match value {
        "bgra8unorm" => Some(PixelFormat::Bgra8Unorm),
        "rgba8unorm" => Some(PixelFormat::Rgba8Unorm),
        _ => None,
    };
}

pub fn parse_render_target_color_space(value: &str) -> Option<RenderTargetColorSpace> {
    return match value {
        "linear" => Some(RenderTargetColorSpace::Linear),
        "srgb" => Some(RenderTargetColorSpace::Srgb),
        _ => None,
    };
}

pub fn parse_texture_color_space(value: &str) -> Option<TextureColorSpace> {
    return match value {
        "linear" => Some(TextureColorSpace::Linear),
        "srgb" => Some(TextureColorSpace::Srgb),
        _ => None,
    };
}

pub fn parse_texture_dimension(value: &str) -> Option<TextureDimension> {
    return match value {
        "2d" => Some(TextureDimension::Texture2D),
        "2d-array" => Some(TextureDimension::Texture2DArray),
        "3d" => Some(TextureDimension::Texture3D),
        "cube" => Some(TextureDimension::Cube),
        _ => None,
    };
}

pub fn parse_texture_filter(value: &str) -> Option<TextureFilter> {
    return match value {
        "linear" => Some(TextureFilter::Linear),
        "linear-mipmap-linear" => Some(TextureFilter::LinearMipmapLinear),
        "linear-mipmap-nearest" => Some(TextureFilter::LinearMipmapNearest),
        "nearest" => Some(TextureFilter::Nearest),
        "nearest-mipmap-linear" => Some(TextureFilter::NearestMipmapLinear),
        "nearest-mipmap-nearest" => Some(TextureFilter::NearestMipmapNearest),
        _ => None,
    };
}

pub fn parse_texture_gamut(value: &str) -> Option<TextureGamut> {
    return match value {
        "display-p3" => Some(TextureGamut::DisplayP3),
        "srgb" => Some(TextureGamut::Srgb),
        _ => None,
    };
}

pub fn parse_texture_wrap(value: &str) -> Option<TextureWrap> {
    return match value {
        "clamp-to-edge" => Some(TextureWrap::ClampToEdge),
        "mirror-repeat" => Some(TextureWrap::MirrorRepeat),
        "repeat" => Some(TextureWrap::Repeat),
        _ => None,
    };
}
