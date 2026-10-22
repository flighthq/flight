// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! A free-list of reusable texture targets lent to multi-pass recipes (TS
//! `wgpuRenderTargetPool.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_texture::RenderTargetColorSpace;

use crate::types::*;
use crate::wgpu_texture_render_target::{
    create_wgpu_texture_render_target, destroy_wgpu_texture_render_target,
    resolve_wgpu_texture_render_target_extent,
};

/// The request `acquire_wgpu_texture_render_target` matches a free target against (TS's inline
/// descriptor).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WgpuTextureRenderTargetDescriptor {
    pub color_space: Option<RenderTargetColorSpace>,
    pub format: Option<wgpu::TextureFormat>,
    pub height: f32,
    pub sample_count: Option<u32>,
    pub width: f32,
}

/// Creates an empty pool (TS `createWgpuRenderTargetPool`).
pub fn create_wgpu_render_target_pool() -> WgpuRenderTargetPool {
    let mut out = WgpuRenderTargetPool {
        runtime: EntityRuntimeSlot::default(),
        free: Vec::new(),
    };
    initialize_wgpu_render_target_pool(&mut out);
    return out;
}

/// Empties a pool (TS `initializeWgpuRenderTargetPool`).
pub fn initialize_wgpu_render_target_pool(out: &mut WgpuRenderTargetPool) {
    out.free = Vec::new();
}

/// Lends a target matching the descriptor's physical extent, format and sample count, reusing a
/// free one when possible (TS `acquireWgpuTextureRenderTarget`). Pair with
/// `release_wgpu_texture_render_target`; a reused target takes the requested color space.
pub fn acquire_wgpu_texture_render_target(
    state: &WgpuRenderState,
    pool: &mut WgpuRenderTargetPool,
    descriptor: &WgpuTextureRenderTargetDescriptor,
) -> Ref<WgpuTextureRenderTarget> {
    let (w, h, sample_count) = resolve_wgpu_texture_render_target_extent(
        descriptor.width,
        descriptor.height,
        descriptor.sample_count.unwrap_or(1),
    );
    let format = descriptor.format.unwrap_or(state.format);
    let found = pool.free.iter().position(|candidate| {
        let candidate = candidate.read().unwrap();
        return candidate.width == w
            && candidate.height == h
            && candidate.format == format
            && candidate.sample_count == sample_count;
    });
    if let Some(index) = found {
        let candidate = pool.free.remove(index);
        candidate.write().unwrap().color_space = descriptor
            .color_space
            .unwrap_or(RenderTargetColorSpace::Srgb);
        return candidate;
    }
    return Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state,
        descriptor.width,
        descriptor.height,
        Some(format),
        descriptor.color_space,
        Some(sample_count),
    )));
}

/// Destroys every free target's storage (TS `destroyWgpuRenderTargetPool`).
pub fn destroy_wgpu_render_target_pool(pool: &mut WgpuRenderTargetPool) {
    for target in &pool.free {
        destroy_wgpu_texture_render_target(&target.read().unwrap());
    }
    pool.free.clear();
}

/// Returns a target to the free list, keeping its storage (TS `releaseWgpuTextureRenderTarget`).
pub fn release_wgpu_texture_render_target(
    pool: &mut WgpuRenderTargetPool,
    target: Ref<WgpuTextureRenderTarget>,
) {
    pool.free.push(target);
}
