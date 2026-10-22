// flight-lint: allow-file(contract-vocabulary) D17 render caches own thread-bound render-gl targets and caller-owned proxy stores

use std::cell::RefCell;
use std::rc::Rc;

use flight_entity::{Ref, get_entity_id, throw_error};
use flight_geometry::{create_matrix, create_rectangle};
use flight_node::{NodeRef, compute_node_root_local_bounds_rectangle};
use flight_render::{
    NodeRenderer, RenderCache, RenderProxies2D, RenderProxy2D, RenderTargetDescriptor,
    RenderTargetPadding, RenderTargetSize, compute_render_cache_transform,
    compute_render_target_size, compute_scene_2d_render_target_transform, get_render_proxy_cache,
    noop_renderer_data, prepare_scene_2d_render, register_render_cache_node_renderer,
};
use flight_render_gl::{
    GlRenderState, GlRenderStateOptions, GlTextureRenderTarget, begin_gl_render_pass,
    create_gl_render_state, create_gl_texture_render_target, destroy_gl_texture_render_target,
    draw_gl_texture_render_target_result, end_gl_render_pass, get_gl_current_render_pass,
    register_gl_render_state_teardown, resize_gl_texture_render_target,
};
use glow::HasContext;

use crate::gl_node2d::render_gl_scene2d;
use crate::gl_quad_batch_writer::flush_gl_quad_batch_writer;
use crate::scene2d_gl_runtime::ensure_scene2d_gl_runtime;
use crate::types::{GlRenderCacheTargetEntry, RenderCacheRefreshOptions};

pub static GL_RENDER_CACHE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: None,
    create_data: noop_renderer_data::<GlRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: draw_gl_render_cache,
};

// The offscreen state shares the owner's GL context. In TS the owner's teardown also destroys it; a
// native GlRenderState is a caller-owned value, so the caller destroys it (destroy_gl_render_state).
pub fn create_gl_cache_state(
    owner_state: &GlRenderState,
    options: Option<&GlRenderStateOptions>,
) -> GlRenderState {
    return create_gl_render_state(Rc::clone(&owner_state.context_state), options);
}

fn destroy_owned_gl_render_cache_targets(owner_state: &mut GlRenderState) {
    let targets = ensure_scene2d_gl_runtime(owner_state)
        .render_cache_targets
        .take();
    let Some(targets) = targets else {
        return;
    };
    for entry in targets {
        destroy_gl_texture_render_target(&mut entry.target.borrow_mut());
    }
}

fn draw_gl_render_cache(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    let Some(cache) = get_render_proxy_cache(state, &render_proxy.source) else {
        return;
    };
    let Some(target) = get_gl_render_cache_target(state, &cache.read().unwrap()) else {
        return;
    };
    // Drain pending batched geometry before the immediate composite quad; without the flush the
    // cached result draws ahead of geometry submitted earlier in the walk.
    flush_gl_quad_batch_writer(state);
    let Some(pass) = get_gl_current_render_pass(state) else {
        return;
    };
    // The proxy transform already carries the cache placement transform (folded in by the adapter),
    // so the target composites with an identity offset.
    let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let _ = draw_gl_texture_render_target_result(
        state,
        &pass,
        render_proxy,
        &target.borrow(),
        &identity,
    );
}

pub fn enable_gl_render_cache(state: &mut GlRenderState) {
    register_render_cache_node_renderer(state, &GL_RENDER_CACHE_RENDERER);
}

/// Allocates or resizes the framebuffer-backed texture `owner_state` composites for `cache`,
/// returning it so a caller can render custom content into it directly. For engine-baked content
/// prefer refresh_gl_render_cache.
pub fn ensure_gl_render_cache_target(
    owner_state: &GlRenderState,
    cache: &RenderCache,
    width: f32,
    height: f32,
) -> Rc<RefCell<GlTextureRenderTarget>> {
    ensure_targets(owner_state);
    let cache_id = get_entity_id(cache);
    if let Some(target) = get_gl_render_cache_target(owner_state, cache) {
        resize_gl_texture_render_target(owner_state, &mut target.borrow_mut(), width, height)
            .unwrap_or_else(|error| throw_error(&error));
        return target;
    }
    let target = create_gl_texture_render_target(
        owner_state,
        &RenderTargetDescriptor {
            width,
            height,
            format: None,
            color_attachments: None,
            color_formats: None,
            sample_count: None,
            depth: None,
            color_space: None,
        },
        None,
    )
    .unwrap_or_else(|error| throw_error(&error))
    .unwrap_or_else(|| throw_error("ensureGlRenderCacheTarget: unsupported render target"));
    let target = Rc::new(RefCell::new(target));
    ensure_scene2d_gl_runtime(owner_state)
        .render_cache_targets
        .get_or_insert_with(Vec::new)
        .push(GlRenderCacheTargetEntry {
            cache: cache_id,
            target: Rc::clone(&target),
        });
    return target;
}

fn ensure_targets(owner_state: &GlRenderState) {
    let mut runtime = ensure_scene2d_gl_runtime(owner_state);
    if runtime.render_cache_targets.is_none() {
        runtime.render_cache_targets = Some(Vec::new());
        drop(runtime);
        register_gl_render_state_teardown(owner_state, destroy_owned_gl_render_cache_targets);
    }
}

pub fn get_gl_render_cache_target(
    owner_state: &GlRenderState,
    cache: &RenderCache,
) -> Option<Rc<RefCell<GlTextureRenderTarget>>> {
    let cache_id = get_entity_id(cache);
    let runtime = ensure_scene2d_gl_runtime(owner_state);
    return runtime
        .render_cache_targets
        .as_ref()?
        .iter()
        .find(|entry| entry.cache == cache_id)
        .map(|entry| Rc::clone(&entry.target));
}

/// Bakes `source`'s subtree into its cache target using the offscreen `cache_state`, then records
/// the transform that places the result back in scene space. Returns whether a bake happened — the
/// offscreen state's own dirtiness decides it, so this is cheap to call every frame. The render-pass
/// bracket owns the shared GL context while the cache state bakes, then restores the screen pass.
// flight-lint: allow(conform-params) D17 the offscreen state's caller-owned proxy store is an explicit argument
pub fn refresh_gl_render_cache(
    owner_state: &GlRenderState,
    cache_state: &mut GlRenderState,
    cache_proxies: &mut RenderProxies2D<GlRenderState>,
    cache: &Ref<RenderCache>,
    source: &NodeRef,
    options: Option<&RenderCacheRefreshOptions>,
) -> bool {
    let padding = options.and_then(|value| value.padding).unwrap_or(0.0);
    let min_width = options.and_then(|value| value.min_width).unwrap_or(1.0);
    let min_height = options.and_then(|value| value.min_height).unwrap_or(1.0);

    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    compute_node_root_local_bounds_rectangle(&mut bounds, source);
    let mut target_size = RenderTargetSize {
        width: 0.0,
        height: 0.0,
    };
    compute_render_target_size(
        &mut target_size,
        &bounds,
        Some(RenderTargetPadding::Uniform(padding)),
        Some(min_width),
        Some(min_height),
    );
    let (width, height) = (target_size.width, target_size.height);

    let resized = {
        let cache = cache.read().unwrap();
        let existing = get_gl_render_cache_target(owner_state, &cache);
        existing.is_none_or(|existing| {
            let existing = existing.borrow();
            existing.axes.width as f32 != width || existing.axes.height as f32 != height
        })
    };
    let target = ensure_gl_render_cache_target(owner_state, &cache.read().unwrap(), width, height);

    let mut render_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    compute_scene_2d_render_target_transform(
        &mut render_transform,
        source,
        &bounds,
        Some(padding),
        Some(padding),
    );
    compute_render_cache_transform(
        &mut cache.write().unwrap().transform,
        &bounds,
        Some(padding),
        Some(padding),
    );

    // Preserve on begin — the bake below clears and redraws only when dirty; clearing here would wipe
    // the retained cache content on the not-dirty path.
    let pass = begin_gl_render_pass(cache_state, &*target.borrow(), None, None)
        .unwrap_or_else(|error| throw_error(&error));
    let dirty = prepare_scene_2d_render(cache_state, cache_proxies, source);
    if dirty || resized {
        // SAFETY: the clear targets the cache pass framebuffer on the owning GL thread.
        unsafe {
            cache_state.gl.clear_color(0.0, 0.0, 0.0, 0.0);
            cache_state.gl.clear(glow::COLOR_BUFFER_BIT);
        }
        render_gl_scene2d(cache_state, cache_proxies, &pass, source, Some(&render_transform));
    }
    end_gl_render_pass(cache_state, &pass).unwrap_or_else(|error| throw_error(&error));

    return dirty || resized;
}

pub fn release_gl_render_cache(owner_state: &GlRenderState, cache: &RenderCache) {
    let cache_id = get_entity_id(cache);
    let entry = {
        let mut runtime = ensure_scene2d_gl_runtime(owner_state);
        let Some(targets) = runtime.render_cache_targets.as_mut() else {
            return;
        };
        let Some(index) = targets.iter().position(|entry| entry.cache == cache_id) else {
            return;
        };
        targets.remove(index)
    };
    // A GlTextureRenderTarget owns a framebuffer and texture; dropping only defers their deletion.
    destroy_gl_texture_render_target(&mut entry.target.borrow_mut());
}
