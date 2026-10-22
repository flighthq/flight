use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_geometry::clone_vector2;
use flight_texture::{
    RenderTargetColorSpace, TextureColorSpace, TextureSourceRef, clone_sampler, create_texture_2d,
};

use crate::{CreateRenderTextureOptions, RenderTarget, RenderTexture};

/// Creates a universal 2D texture whose GPU-origin target is realized lazily by the first backend
/// that renders into or samples it.
// flight-lint: allow(conform-extra) approved relocation from texture/renderTexture.ts to flight-render
pub fn create_render_texture(options: &CreateRenderTextureOptions) -> RenderTexture {
    let texture_color_space = options.color_space.unwrap_or(TextureColorSpace::Linear);
    let target_color_space = match texture_color_space {
        TextureColorSpace::Linear => RenderTargetColorSpace::Linear,
        TextureColorSpace::Srgb => RenderTargetColorSpace::Srgb,
    };
    let mut target: RenderTarget = allocate_entity();
    initialize_render_texture_target(&mut target, options, target_color_space);
    let target = Arc::new(RwLock::new(target));
    let source: TextureSourceRef = target;

    let mut texture = create_texture_2d();
    texture.color_space = texture_color_space;
    texture.flip_x = options.flip_x.unwrap_or(false);
    texture.flip_y = options.flip_y.unwrap_or(false);
    if let Some(sampler) = &options.sampler {
        texture.sampler = clone_sampler(sampler);
    }
    if let Some(offset) = &options.uv_offset {
        texture.uv_offset = clone_vector2(offset);
    }
    texture.uv_rotation = options.uv_rotation.unwrap_or(0.0);
    if let Some(scale) = &options.uv_scale {
        texture.uv_scale = clone_vector2(scale);
    }
    texture.source = Some(source);
    return texture;
}

// flight-lint: allow(conform-extra) approved relocation from texture/renderTexture.ts to flight-render
pub fn initialize_render_texture_target(
    out: &mut RenderTarget,
    options: &CreateRenderTextureOptions,
    color_space: RenderTargetColorSpace,
) {
    out.color_attachments = options.color_attachments;
    out.color_formats = options.color_formats.clone();
    out.color_space = color_space;
    out.depth = options.depth;
    out.format = options.format;
    out.height = options.height;
    out.kind = crate::RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string();
    out.sample_count = options.sample_count;
    out.version = 0;
    out.width = options.width;
}
