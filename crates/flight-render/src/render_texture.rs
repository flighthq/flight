use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_texture::{
    CreateTexture2DOptions, CreateTextureCommonOptions, RenderTargetColorSpace, TextureColorSpace,
    TextureSourceRef, create_texture_2d,
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

    return create_texture_2d(Some(&CreateTexture2DOptions {
        common: CreateTextureCommonOptions {
            color_space: Some(texture_color_space),
            flip_x: Some(options.flip_x.unwrap_or(false)),
            flip_y: Some(options.flip_y.unwrap_or(false)),
            sampler: options.sampler.clone(),
            uv_offset: options.uv_offset.clone(),
            uv_rotation: options.uv_rotation,
            uv_scale: options.uv_scale.clone(),
            version: None,
        },
        source: Some(source),
    }));
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
