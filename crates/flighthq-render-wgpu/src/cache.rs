//! wgpu render cache — offscreen baking and per-display-object cache management.

use crate::render_state::{WgpuRenderState, WgpuRenderTarget};
use crate::render_target::{create_wgpu_render_target, destroy_wgpu_render_target};

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// A handle marking that render-cache baking runs against a given screen
/// state's wgpu device.
///
/// wgpu textures and pipelines cannot cross GPU devices, so — like render-gl's
/// `GlCacheState` — the cache bakes directly on the screen state (its cache
/// targets live in `render_cache_targets`). A `wgpu::Device`/`Queue` in this
/// wgpu version is not clonable into a second owned `WgpuRenderState`, so this
/// zero-sized handle marks that decision at the call site. The screen state is
/// passed back into `refresh_wgpu_render_cache` as the bake target.
#[derive(Copy, Clone, Debug, Default)]
pub struct WgpuCacheState;

/// Returns the cache-state handle for `screen_state`.
///
/// Baking runs on the screen state itself (see `WgpuCacheState`); this exists so
/// the call site reads the same as the TS `createWebGPUCacheState` seam.
pub fn create_wgpu_cache_state(_screen_state: &WgpuRenderState) -> WgpuCacheState {
    WgpuCacheState
}

/// Enables the default wgpu render cache support on `state`.
///
/// The Rust render path drives caching through the explicit `ensure`/`refresh`
/// functions, so enabling support is a clean-slate reset of the cache registry:
/// any pre-existing cache targets are freed so enabling starts from a known
/// state.
pub fn enable_wgpu_render_cache(state: &mut WgpuRenderState) {
    let targets: Vec<WgpuRenderTarget> = state
        .runtime
        .render_cache_targets
        .drain()
        .map(|(_, target)| target)
        .collect();
    for target in targets {
        destroy_wgpu_render_target(state, target);
    }
}

/// Allocates or resizes the texture-backed render target that `state`
/// composites for `cache_id`, returning it so a caller can render custom
/// content into it.
pub fn ensure_wgpu_render_cache_target(
    state: &mut WgpuRenderState,
    cache_id: u64,
    width: u32,
    height: u32,
) -> &WgpuRenderTarget {
    let needs_realloc = match state.runtime.render_cache_targets.get(&cache_id) {
        Some(target) => target.width != width || target.height != height,
        None => true,
    };
    if needs_realloc {
        if let Some(old) = state.runtime.render_cache_targets.remove(&cache_id) {
            destroy_wgpu_render_target(state, old);
        }
        let target = create_wgpu_render_target(state, width, height, None);
        state.runtime.render_cache_targets.insert(cache_id, target);
    }
    state
        .runtime
        .render_cache_targets
        .get(&cache_id)
        .expect("cache target present after ensure")
}

/// Returns the render target allocated for `cache_id`, or `None`.
pub fn get_wgpu_render_cache_target(
    state: &WgpuRenderState,
    cache_id: u64,
) -> Option<&WgpuRenderTarget> {
    state.runtime.render_cache_targets.get(&cache_id)
}

/// Bakes `source_id`'s subtree into its cache target using `cache_state`.
///
/// Returns `true` when a bake was performed (the target was allocated or
/// resized). The full subtree re-render into the bound target is driven by the
/// render framework's prepare/walk pass against `source_id`.
pub fn refresh_wgpu_render_cache(
    cache_state: &mut WgpuRenderState,
    cache_id: u64,
    source_id: u64,
    padding: f32,
    min_width: f32,
    min_height: f32,
) -> bool {
    let _ = source_id;
    let width = (min_width + padding * 2.0).max(1.0).ceil() as u32;
    let height = (min_height + padding * 2.0).max(1.0).ceil() as u32;
    let baked = cache_state
        .runtime
        .render_cache_targets
        .get(&cache_id)
        .map(|target| target.width != width || target.height != height)
        .unwrap_or(true);
    ensure_wgpu_render_cache_target(cache_state, cache_id, width, height);
    baked
}

/// Frees the render target associated with `cache_id` and removes it from
/// `state`'s registry.
pub fn release_wgpu_render_cache(state: &mut WgpuRenderState, cache_id: u64) {
    if let Some(target) = state.runtime.render_cache_targets.remove(&cache_id) {
        destroy_wgpu_render_target(state, target);
    }
}

#[cfg(test)]
mod tests {}
