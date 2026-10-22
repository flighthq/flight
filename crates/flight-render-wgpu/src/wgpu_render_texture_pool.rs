// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! An app-level lease pool of render textures (TS `wgpuRenderTexturePool.ts`), locked to the first
//! device that uses it.

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_render::{
    CreateRenderTextureOptions, RenderTarget, RenderTargetDescriptor, RenderTexture,
    create_render_texture,
};
use flight_texture::{RenderTargetColorSpace, TextureColorSpace, reset_texture_uv_transform};

use crate::types::*;
use crate::wgpu_render_target_pool::{
    create_wgpu_render_target_pool, destroy_wgpu_render_target_pool,
};
use crate::wgpu_render_texture::{destroy_wgpu_render_texture, invalidate_wgpu_render_texture};

/// Creates an empty pool (TS `createWgpuRenderTexturePool`).
pub fn create_wgpu_render_texture_pool() -> WgpuRenderTexturePool {
    let mut out = WgpuRenderTexturePool {
        runtime: EntityRuntimeSlot::default(),
        device: None,
        destroyed: false,
        effect_targets: create_wgpu_render_target_pool(),
        free: Vec::new(),
        leased: Vec::new(),
    };
    initialize_wgpu_render_texture_pool(&mut out);
    return out;
}

/// Resets a pool to empty and unlocked (TS `initializeWgpuRenderTexturePool`).
pub fn initialize_wgpu_render_texture_pool(out: &mut WgpuRenderTexturePool) {
    out.device = None;
    out.destroyed = false;
    out.effect_targets = create_wgpu_render_target_pool();
    out.free = Vec::new();
    out.leased = Vec::new();
}

/// Leases a render texture shaped by `descriptor`, reusing a free one when available (TS
/// `acquireWgpuRenderTexture`). Its content starts unrendered.
pub fn acquire_wgpu_render_texture(
    state: &WgpuRenderState,
    pool: &mut WgpuRenderTexturePool,
    descriptor: &RenderTargetDescriptor,
) -> Ref<RenderTexture> {
    assert_usable_pool(state, pool);
    let render_texture = pool.free.pop().unwrap_or_else(|| {
        return Arc::new(RwLock::new(create_render_texture(
            &CreateRenderTextureOptions {
                color_space: None,
                color_attachments: descriptor.color_attachments,
                color_formats: descriptor.color_formats.clone(),
                depth: descriptor.depth,
                format: descriptor.format,
                height: descriptor.height.ceil().max(0.0) as u32,
                sample_count: descriptor.sample_count,
                width: descriptor.width.ceil().max(0.0) as u32,
                ..CreateRenderTextureOptions::default()
            },
        )));
    });
    {
        let mut texture = render_texture.write().unwrap();
        apply_render_target_descriptor(&texture, descriptor);
        reset_texture_uv_transform(&mut *texture);
        texture.color_space = get_texture_color_space(descriptor.color_space);
        invalidate_wgpu_render_texture(state, &texture, None);
    }
    pool.leased.push(render_texture.clone());
    return render_texture;
}

fn apply_render_target_descriptor(
    render_texture: &RenderTexture,
    descriptor: &RenderTargetDescriptor,
) {
    let source = render_texture
        .source
        .as_ref()
        .expect("a render texture carries a RenderTarget source");
    let mut source = source.write().unwrap();
    let target = (&mut *source as &mut dyn std::any::Any)
        .downcast_mut::<RenderTarget>()
        .expect("a render texture carries a RenderTarget source");
    target.width = descriptor.width.ceil().max(0.0) as u32;
    target.height = descriptor.height.ceil().max(0.0) as u32;
    target.format = descriptor.format;
    target.color_attachments = descriptor.color_attachments;
    target.color_formats = descriptor.color_formats.clone();
    target.sample_count = descriptor.sample_count;
    target.depth = descriptor.depth;
    target.color_space = descriptor
        .color_space
        .unwrap_or(RenderTargetColorSpace::Srgb);
    target.version = target.version.wrapping_add(1);
}

fn assert_pool_device(state: &WgpuRenderState, pool: &mut WgpuRenderTexturePool) {
    // Device identity is the host handle's (D26), not wgpu's per-instance id equality.
    match &pool.device {
        None => pool.device = Some(state.device.clone()),
        Some(existing) if !Arc::ptr_eq(&existing.handle, &state.device.handle) => {
            panic!("WgpuRenderTexturePool cannot cross GPU devices");
        }
        Some(_) => {}
    }
}

fn assert_usable_pool(state: &WgpuRenderState, pool: &mut WgpuRenderTexturePool) {
    if pool.destroyed {
        panic!("WgpuRenderTexturePool has been destroyed");
    }
    assert_pool_device(state, pool);
}

/// Destroys free and outstanding handles alike (TS `destroyWgpuRenderTexturePool`). Shutdown does
/// not require callers to recover every displayed lease first; the pool is unusable afterward.
pub fn destroy_wgpu_render_texture_pool(
    state: &mut WgpuRenderState,
    pool: &mut WgpuRenderTexturePool,
) {
    if pool.destroyed {
        return;
    }
    assert_pool_device(state, pool);
    let mut textures: Vec<Ref<RenderTexture>> = Vec::new();
    for texture in pool.free.iter().chain(pool.leased.iter()) {
        if !textures.iter().any(|seen| Arc::ptr_eq(seen, texture)) {
            textures.push(texture.clone());
        }
    }
    for render_texture in &textures {
        destroy_wgpu_render_texture(state, &render_texture.read().unwrap());
    }
    pool.free.clear();
    pool.leased.clear();
    destroy_wgpu_render_target_pool(&mut pool.effect_targets);
    pool.destroyed = true;
}

fn get_texture_color_space(color_space: Option<RenderTargetColorSpace>) -> TextureColorSpace {
    return match color_space.unwrap_or(RenderTargetColorSpace::Srgb) {
        RenderTargetColorSpace::Linear => TextureColorSpace::Linear,
        RenderTargetColorSpace::Srgb => TextureColorSpace::Srgb,
    };
}

/// Returns a lease to the free list, marking its content released (TS
/// `releaseWgpuRenderTexture`). Panics when the texture is not leased from this pool.
pub fn release_wgpu_render_texture(
    state: &WgpuRenderState,
    pool: &mut WgpuRenderTexturePool,
    render_texture: &Ref<RenderTexture>,
) {
    assert_usable_pool(state, pool);
    let Some(index) = pool
        .leased
        .iter()
        .position(|leased| Arc::ptr_eq(leased, render_texture))
    else {
        panic!("releaseWgpuRenderTexture: texture is not leased from this pool");
    };
    pool.leased.remove(index);
    invalidate_wgpu_render_texture(
        state,
        &render_texture.read().unwrap(),
        Some(WgpuRenderTextureStatus::Released),
    );
    pool.free.push(render_texture.clone());
}

/// Leases one texture per descriptor for the callback's duration, releasing every lease still held
/// afterward, in reverse order, even when the callback panics (TS `withWgpuRenderTextures`).
pub fn with_wgpu_render_textures<T>(
    state: &mut WgpuRenderState,
    pool: &mut WgpuRenderTexturePool,
    descriptors: &[RenderTargetDescriptor],
    callback: impl FnOnce(&mut WgpuRenderState, &mut WgpuRenderTexturePool, &[Ref<RenderTexture>]) -> T,
) -> T {
    let mut textures: Vec<Ref<RenderTexture>> = Vec::new();
    let result = catch_unwind(AssertUnwindSafe(|| {
        for descriptor in descriptors {
            textures.push(acquire_wgpu_render_texture(state, pool, descriptor));
        }
        return callback(state, pool, &textures);
    }));
    for texture in textures.iter().rev() {
        if pool
            .leased
            .iter()
            .any(|leased| Arc::ptr_eq(leased, texture))
        {
            release_wgpu_render_texture(state, pool, texture);
        }
    }
    return match result {
        Ok(value) => value,
        Err(payload) => resume_unwind(payload),
    };
}
