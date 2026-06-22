//! GL render target pool — acquire/release cycle for temporary off-screen targets.

use crate::render_state::{GlRenderState, GlRenderTarget, GlRenderTargetFormat};
use crate::render_target::{create_gl_render_target, destroy_gl_render_target};

/// A pool that reuses off-screen render targets of compatible dimensions and
/// formats. The `target_id` returned by `acquire_gl_render_target` (the entry
/// index) is what `release_gl_render_target` takes back.
#[derive(Default, Debug)]
pub struct GlRenderTargetPool {
    entries: Vec<GlRenderTargetPoolEntry>,
}

#[derive(Debug)]
struct GlRenderTargetPoolEntry {
    target: GlRenderTarget,
    in_use: bool,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Acquires a render target from `pool` with at least the given dimensions and
/// matching format, creating one if no compatible free entry exists. Returns
/// the entry index (`target_id`) and a mutable reference to the target.
///
/// Every `acquire_gl_render_target` must be paired with a matching
/// `release_gl_render_target`.
pub fn acquire_gl_render_target(
    state: &mut GlRenderState,
    pool: &mut GlRenderTargetPool,
    width: u32,
    height: u32,
    format: GlRenderTargetFormat,
) -> u64 {
    for (index, entry) in pool.entries.iter_mut().enumerate() {
        if !entry.in_use
            && entry.target.format == format
            && entry.target.width >= width
            && entry.target.height >= height
        {
            entry.in_use = true;
            return index as u64;
        }
    }
    let target = create_gl_render_target(state, width, height, format, 1);
    pool.entries.push(GlRenderTargetPoolEntry {
        target,
        in_use: true,
    });
    (pool.entries.len() - 1) as u64
}

/// Creates a new `GlRenderTargetPool`.
pub fn create_gl_render_target_pool() -> GlRenderTargetPool {
    GlRenderTargetPool::default()
}

/// Destroys all render targets held by `pool` and frees their GL resources.
pub fn destroy_gl_render_target_pool(state: &GlRenderState, pool: GlRenderTargetPool) {
    for entry in pool.entries {
        destroy_gl_render_target(state, entry.target);
    }
}

/// Returns a shared reference to a pooled target by its `target_id`, or `None`.
pub fn get_gl_render_target(pool: &GlRenderTargetPool, target_id: u64) -> Option<&GlRenderTarget> {
    pool.entries.get(target_id as usize).map(|e| &e.target)
}

/// Returns a render target to `pool` so it can be reused in a subsequent
/// `acquire_gl_render_target` call.
pub fn release_gl_render_target(pool: &mut GlRenderTargetPool, target_id: u64) {
    if let Some(entry) = pool.entries.get_mut(target_id as usize) {
        entry.in_use = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_gl_render_target_pool

    #[test]
    fn create_gl_render_target_pool_starts_empty() {
        let pool = create_gl_render_target_pool();
        assert!(get_gl_render_target(&pool, 0).is_none());
    }

    // release_gl_render_target

    #[test]
    fn release_gl_render_target_out_of_range_is_noop() {
        let mut pool = create_gl_render_target_pool();
        // No panic on an unknown id.
        release_gl_render_target(&mut pool, 99);
    }
}
