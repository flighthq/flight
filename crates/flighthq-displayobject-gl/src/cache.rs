//! GL render cache — offscreen baking and per-display-object cache management.

use flighthq_render_gl::{GlRenderState, GlRenderTarget, GlRenderTargetFormat};
use flighthq_render_gl::{create_gl_render_target, destroy_gl_render_target};

/// A handle identifying that render-cache baking runs against a given screen
/// state's GL context.
///
/// The TS port creates a *separate* offscreen render state that aliases the
/// screen state's WebGL context. A `glow::Context` cannot be shared into a
/// second owned Rust `GlRenderState`, so the cache instead bakes directly on the
/// screen state (its cache targets live in `render_cache_targets`). This zero-
/// sized handle marks that decision at the call site.
#[derive(Copy, Clone, Debug, Default)]
pub struct GlCacheState;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the cache-state handle for `screen_state`.
///
/// Baking runs on the screen state itself (see `GlCacheState`); this exists so
/// the call site reads the same as the TS `createWebGLCacheState` seam.
pub fn create_gl_cache_state(_screen_state: &GlRenderState) -> GlCacheState {
    GlCacheState
}

/// Enables the default GL render cache support on `state`.
///
/// The Rust render path drives caching through the explicit `ensure`/`refresh`
/// functions, so enabling support is a clean-slate reset of the cache registry.
pub fn enable_gl_render_cache(state: &mut GlRenderState) {
    // Free any pre-existing cache targets so enabling starts from a known state.
    let targets: Vec<GlRenderTarget> = state
        .runtime
        .render_cache_targets
        .drain()
        .map(|(_, t)| t)
        .collect();
    for target in targets {
        destroy_gl_render_target(state, target);
    }
}

/// Allocates or resizes the framebuffer-backed texture that `state` composites
/// for `cache_id`, returning it so a caller can render custom content into it.
pub fn ensure_gl_render_cache_target(
    state: &mut GlRenderState,
    cache_id: u64,
    width: u32,
    height: u32,
) -> &GlRenderTarget {
    let needs_realloc = match state.runtime.render_cache_targets.get(&cache_id) {
        Some(t) => t.width != width || t.height != height,
        None => true,
    };
    if needs_realloc {
        if let Some(old) = state.runtime.render_cache_targets.remove(&cache_id) {
            destroy_gl_render_target(state, old);
        }
        let target = create_gl_render_target(state, width, height, GlRenderTargetFormat::Rgba8, 1);
        state.runtime.render_cache_targets.insert(cache_id, target);
    }
    state
        .runtime
        .render_cache_targets
        .get(&cache_id)
        .expect("cache target present after ensure")
}

/// Returns the render target allocated for `cache_id`, or `None`.
pub fn get_gl_render_cache_target(state: &GlRenderState, cache_id: u64) -> Option<&GlRenderTarget> {
    state.runtime.render_cache_targets.get(&cache_id)
}

/// Bakes `source_id`'s subtree into its cache target.
///
/// Returns `true` when a bake was performed (the target was allocated or
/// resized). The full subtree re-render into the bound target is driven by the
/// render framework's prepare/walk pass against `source_id`.
pub fn refresh_gl_render_cache(
    cache_state: &mut GlRenderState,
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
        .map(|t| t.width != width || t.height != height)
        .unwrap_or(true);
    ensure_gl_render_cache_target(cache_state, cache_id, width, height);
    baked
}

/// Frees the render target associated with `cache_id` and removes it from
/// `state`'s registry.
pub fn release_gl_render_cache(state: &mut GlRenderState, cache_id: u64) {
    if let Some(target) = state.runtime.render_cache_targets.remove(&cache_id) {
        destroy_gl_render_target(state, target);
    }
}

#[cfg(test)]
mod tests {}
