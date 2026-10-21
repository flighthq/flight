use crate::types::{RenderTargetColorSpace, TextureColorSpace};

pub fn get_texture_sample_color_space(
    source: TextureColorSpace,
    working: RenderTargetColorSpace,
) -> TextureColorSpace {
    return if should_decode_texture_on_sample(source, working) {
        TextureColorSpace::Srgb
    } else {
        TextureColorSpace::Linear
    };
}

pub fn should_decode_texture_on_sample(
    source: TextureColorSpace,
    working: RenderTargetColorSpace,
) -> bool {
    return source == TextureColorSpace::Srgb && working == RenderTargetColorSpace::Linear;
}

pub fn should_premultiply_texture_on_upload(
    source: TextureColorSpace,
    working: RenderTargetColorSpace,
) -> bool {
    return !should_decode_texture_on_sample(source, working);
}
