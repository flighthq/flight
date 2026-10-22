// flight-lint: allow-file(contract-vocabulary) D17 pooled render textures retain native callback and Result ownership contracts

use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::rc::Rc;

use flight_entity::EntityRuntimeSlot;
use flight_render::{
    CreateRenderTextureOptions, RenderTarget, RenderTargetDescriptor, RenderTexture,
    create_render_texture,
};
use flight_texture::{
    RenderTargetColorSpace, TextureColorSpace, TextureSource, TextureUvTransform,
    reset_texture_uv_transform,
};

use crate::{
    GlRenderState, GlRenderTexturePool, GlRenderTextureStatus,
    create_gl_texture_render_target_pool, destroy_gl_render_texture,
    destroy_gl_render_texture_by_source_id, destroy_gl_texture_render_target_pool,
    get_gl_render_texture_source_id, invalidate_gl_render_texture,
};

pub fn create_gl_render_texture_pool() -> GlRenderTexturePool {
    let mut out = GlRenderTexturePool {
        runtime: EntityRuntimeSlot::default(),
        context_id: None,
        destroyed: false,
        effect_targets: create_gl_texture_render_target_pool(),
        free: Vec::new(),
        leased: Default::default(),
    };
    initialize_gl_render_texture_pool(&mut out);
    return out;
}

pub fn initialize_gl_render_texture_pool(out: &mut GlRenderTexturePool) {
    out.context_id = None;
    out.destroyed = false;
    out.effect_targets = create_gl_texture_render_target_pool();
    out.free.clear();
    out.leased.clear();
}

pub fn acquire_gl_render_texture(
    state: &GlRenderState,
    pool: &mut GlRenderTexturePool,
    descriptor: &RenderTargetDescriptor,
) -> Result<RenderTexture, String> {
    assert_usable_pool(state, pool)?;
    let mut render_texture = pool.free.pop().unwrap_or_else(|| {
        create_render_texture(&CreateRenderTextureOptions {
            color_space: Some(texture_color_space(descriptor.color_space)),
            color_attachments: descriptor.color_attachments,
            color_formats: descriptor.color_formats.clone(),
            depth: descriptor.depth,
            format: descriptor.format,
            height: descriptor.height.max(0.0) as u32,
            sample_count: descriptor.sample_count,
            width: descriptor.width.max(0.0) as u32,
            ..CreateRenderTextureOptions::default()
        })
    });
    apply_render_target_descriptor(&mut render_texture, descriptor)?;
    reset_texture_uv_transform(&mut render_texture);
    render_texture.texture_fields_mut().color_space = texture_color_space(descriptor.color_space);
    invalidate_gl_render_texture(state, &render_texture, None);
    let id = get_gl_render_texture_source_id(&render_texture)
        .ok_or_else(|| "acquireGlRenderTexture: texture has no RenderTarget source".to_string())?;
    pool.leased.insert(id);
    return Ok(render_texture);
}

fn apply_render_target_descriptor(
    render_texture: &mut RenderTexture,
    descriptor: &RenderTargetDescriptor,
) -> Result<(), String> {
    let source = render_texture
        .source
        .as_ref()
        .ok_or_else(|| "RenderTexture has no source".to_string())?;
    let mut source = source.write().unwrap();
    let target = (&mut *source as &mut dyn Any)
        .downcast_mut::<RenderTarget>()
        .ok_or_else(|| "RenderTexture source is not a RenderTarget".to_string())?;
    target.width = descriptor.width.max(0.0) as u32;
    target.height = descriptor.height.max(0.0) as u32;
    target.format = descriptor.format;
    target.color_attachments = descriptor.color_attachments;
    target.color_formats.clone_from(&descriptor.color_formats);
    target.sample_count = descriptor.sample_count;
    target.depth = descriptor.depth;
    target.color_space = descriptor
        .color_space
        .unwrap_or(RenderTargetColorSpace::Srgb);
    target.texture_source_fields_mut().version =
        target.texture_source_fields().version.wrapping_add(1);
    return Ok(());
}

fn assert_pool_context(
    state: &GlRenderState,
    pool: &mut GlRenderTexturePool,
) -> Result<(), String> {
    let context_id = Rc::as_ptr(&state.context_state) as usize;
    match pool.context_id {
        None => pool.context_id = Some(context_id),
        Some(current) if current != context_id => {
            return Err("GlRenderTexturePool cannot cross GL contexts".to_string());
        }
        Some(_) => {}
    }
    return Ok(());
}

fn assert_usable_pool(state: &GlRenderState, pool: &mut GlRenderTexturePool) -> Result<(), String> {
    if pool.destroyed {
        return Err("GlRenderTexturePool has been destroyed".to_string());
    }
    return assert_pool_context(state, pool);
}

// flight-lint: allow(hashmap-iteration) Pool teardown invalidates all leases and target destruction order is unobservable
pub fn destroy_gl_render_texture_pool(
    state: &GlRenderState,
    pool: &mut GlRenderTexturePool,
) -> Result<(), String> {
    if pool.destroyed {
        return Ok(());
    }
    assert_pool_context(state, pool)?;
    for texture in pool.free.drain(..) {
        destroy_gl_render_texture(state, &texture);
    }
    for source_id in pool.leased.drain() {
        destroy_gl_render_texture_by_source_id(state, source_id);
    }
    destroy_gl_texture_render_target_pool(&mut pool.effect_targets);
    pool.destroyed = true;
    return Ok(());
}

pub fn release_gl_render_texture(
    state: &GlRenderState,
    pool: &mut GlRenderTexturePool,
    render_texture: RenderTexture,
) -> Result<(), String> {
    assert_usable_pool(state, pool)?;
    let id = get_gl_render_texture_source_id(&render_texture)
        .ok_or_else(|| "releaseGlRenderTexture: texture has no RenderTarget source".to_string())?;
    if !pool.leased.remove(&id) {
        return Err("releaseGlRenderTexture: texture is not leased from this pool".to_string());
    }
    invalidate_gl_render_texture(
        state,
        &render_texture,
        Some(GlRenderTextureStatus::Released),
    );
    pool.free.push(render_texture);
    return Ok(());
}

fn texture_color_space(color_space: Option<RenderTargetColorSpace>) -> TextureColorSpace {
    return match color_space.unwrap_or(RenderTargetColorSpace::Srgb) {
        RenderTargetColorSpace::Linear => TextureColorSpace::Linear,
        RenderTargetColorSpace::Srgb => TextureColorSpace::Srgb,
    };
}

pub fn with_gl_render_textures<T, F>(
    state: &GlRenderState,
    pool: &mut GlRenderTexturePool,
    descriptors: &[RenderTargetDescriptor],
    callback: F,
) -> Result<T, String>
where
    F: FnOnce(&[RenderTexture]) -> T,
{
    let mut textures = Vec::with_capacity(descriptors.len());
    for descriptor in descriptors {
        match acquire_gl_render_texture(state, pool, descriptor) {
            Ok(texture) => textures.push(texture),
            Err(error) => {
                while let Some(texture) = textures.pop() {
                    release_gl_render_texture(state, pool, texture)?;
                }
                return Err(error);
            }
        }
    }
    let result = catch_unwind(AssertUnwindSafe(|| callback(&textures)));
    while let Some(texture) = textures.pop() {
        let id = get_gl_render_texture_source_id(&texture);
        if id.is_some_and(|id| pool.leased.contains(&id)) {
            release_gl_render_texture(state, pool, texture)?;
        }
    }
    return match result {
        Ok(value) => Ok(value),
        Err(payload) => resume_unwind(payload),
    };
}
