//! wgpu render target pool — acquire/release cycle for temporary off-screen targets.
//!
//! `acquire`/`release` are paired brackets: every `acquire_wgpu_render_target`
//! must have a matching `release_wgpu_render_target`. A released target returns
//! to the free list (its GPU storage is kept) rather than being destroyed.

use crate::render_state::{WgpuRenderState, WgpuRenderTarget};
use crate::render_target::{create_wgpu_render_target, destroy_wgpu_render_target};

/// A pool that reuses off-screen render targets of compatible dimensions and
/// formats.
#[derive(Default, Debug)]
pub struct WgpuRenderTargetPool {
    free: Vec<WgpuRenderTarget>,
}

/// Acquires a render target from `pool` with the given dimensions and format,
/// reusing a compatible free entry when one exists or creating a new target.
///
/// `format` defaults to the swapchain format when `None`.
pub fn acquire_wgpu_render_target(
    state: &WgpuRenderState,
    pool: &mut WgpuRenderTargetPool,
    width: u32,
    height: u32,
    format: Option<wgpu::TextureFormat>,
) -> WgpuRenderTarget {
    let resolved_format = format.unwrap_or(state.format);
    if let Some(index) = pool
        .free
        .iter()
        .position(|t| t.width == width && t.height == height && t.format == resolved_format)
    {
        return pool.free.swap_remove(index);
    }
    create_wgpu_render_target(state, width, height, Some(resolved_format))
}

/// Creates a new empty `WgpuRenderTargetPool`.
pub fn create_wgpu_render_target_pool() -> WgpuRenderTargetPool {
    WgpuRenderTargetPool::default()
}

/// Destroys all render targets held by `pool` and frees their GPU resources.
pub fn destroy_wgpu_render_target_pool(state: &WgpuRenderState, pool: WgpuRenderTargetPool) {
    for target in pool.free {
        destroy_wgpu_render_target(state, target);
    }
}

/// Returns a render target to `pool` so it can be reused by a subsequent
/// `acquire_wgpu_render_target` call.
pub fn release_wgpu_render_target(pool: &mut WgpuRenderTargetPool, target: WgpuRenderTarget) {
    pool.free.push(target);
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_wgpu_render_target_pool

    #[test]
    fn create_wgpu_render_target_pool_starts_empty() {
        let pool = create_wgpu_render_target_pool();
        assert!(pool.free.is_empty());
    }
}
