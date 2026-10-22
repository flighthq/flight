// flight-lint: allow-file(contract-vocabulary) D17 render caches bind native wgpu texture targets over render-wgpu state and caller-owned proxies
//! Render caches on the WebGPU backend (TS `wgpuCache.ts`): a subtree bakes into an offscreen
//! texture target owned by the screen state, keyed by the cache handle, and composites back as one
//! quad. The source's module WeakMap of targets per state is the state's own package record (D5).

use flight_render::RenderTargetClear;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, get_entity_id};
use flight_geometry::{Matrix, create_matrix, create_rectangle, multiply_matrix};
use flight_node::{NodeRef, compute_node_bounds_rectangle};
use flight_render::{
    NodeRenderer, RenderCache, RenderCacheRefreshOptions, RenderProxies2D, RenderProxy2D,
    RenderState, RenderTargetPadding, RenderTargetSize, compute_render_cache_transform,
    compute_render_target_size, compute_scene_2d_render_target_transform, get_render_proxy_cache,
    noop_renderer_data, prepare_scene_2d_render, register_render_cache_node_renderer,
};
use flight_render_wgpu::{
    WgpuApplyBlendModeParent, WgpuDeviceState, WgpuRenderState, WgpuRenderStateOptions,
    WgpuRenderTarget, WgpuTextureRenderTarget, begin_wgpu_render_pass,
    create_wgpu_offscreen_render_state_from_device_state, create_wgpu_texture_render_target,
    destroy_wgpu_render_state, destroy_wgpu_texture_render_target,
    draw_wgpu_texture_render_target_result, end_wgpu_render_pass,
    get_wgpu_render_proxy_color_scale_bias, get_wgpu_render_state_runtime,
    register_wgpu_render_state_teardown, resize_wgpu_texture_render_target, with_wgpu_frame_borrow,
};

use crate::scene2d_wgpu_runtime::{
    ensure_scene2d_wgpu_runtime, get_scene2d_wgpu_runtime, get_scene2d_wgpu_runtime_mut,
};
use crate::types::*;
use crate::wgpu_node2d::render_wgpu_scene2d;
use crate::wgpu_quad_batch_writer::flush_wgpu_quad_batch_writer;

/// The render-cache renderer (TS `wgpuRenderCacheRenderer`): composites a cache's baked target.
pub static WGPU_RENDER_CACHE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: noop_renderer_data::<WgpuRenderState>,
    destroy_data: None,
    is_dirty: None,
    submit: draw_wgpu_render_cache,
};

/// Creates an offscreen render state for baking render caches consumed by `owner_state` (TS
/// `createWgpuCacheState`). Textures and pipelines cannot cross devices, so it shares the owner's
/// explicit device tier; it owns its pipeline snapshot, uniform ring and batch resources, and a
/// bounded frame borrow supplies the live encoder and pass while a bake records. The owner is kept
/// only for late blend policy, and the owner's teardown closes this state exactly once. The state is
/// returned shared because the owner's teardown holds it too (TS object identity).
pub fn create_wgpu_cache_state(
    owner_state: &mut WgpuRenderState,
    device_state: &WgpuDeviceState,
    options: Option<&WgpuRenderStateOptions>,
) -> Ref<WgpuRenderState> {
    let cache_state = create_wgpu_offscreen_render_state_from_device_state(device_state, options);
    *cache_state.apply_blend_mode.write().unwrap() = None;
    *get_wgpu_render_state_runtime(&cache_state)
        .apply_blend_mode_parent
        .write()
        .unwrap() = Some(WgpuApplyBlendModeParent {
        apply_blend_mode: owner_state.apply_blend_mode.clone(),
        parent: get_wgpu_render_state_runtime(owner_state)
            .apply_blend_mode_parent
            .clone(),
    });
    let cache_state = Arc::new(RwLock::new(cache_state));
    let teardown_state = cache_state.clone();
    register_wgpu_render_state_teardown(
        owner_state,
        Arc::new(move |_owner: &mut WgpuRenderState| {
            // The cache state's proxies are caller-owned; teardown frees the state's own resources.
            let mut proxies: RenderProxies2D<WgpuRenderState> = RenderProxies2D::default();
            destroy_wgpu_render_state(&mut teardown_state.write().unwrap(), &mut proxies);
        }),
    );
    return cache_state;
}

fn destroy_owned_wgpu_render_cache_targets(state: &mut WgpuRenderState) {
    let Some(targets) =
        get_scene2d_wgpu_runtime_mut(state).and_then(|runtime| runtime.render_cache_targets.take())
    else {
        return;
    };
    for entry in &targets {
        destroy_wgpu_texture_render_target(&entry.target.read().unwrap());
    }
}

fn draw_wgpu_render_cache(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) {
    let Some(cache) = get_render_proxy_cache(state, &render_proxy.source) else {
        return;
    };
    let Some(target) = get_wgpu_render_cache_target(state, &cache.read().unwrap()) else {
        return;
    };
    // Drain pending batched geometry before the immediate composite quad: without the flush the
    // immediate quad would interleave with the un-flushed batch's instance and bind-group state.
    flush_wgpu_quad_batch_writer(state);
    // The proxy's transform already carries the cache placement transform (folded in by the
    // adapter), so the target composites with an identity offset.
    let identity: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let color_scale_bias = get_wgpu_render_proxy_color_scale_bias(render_proxy);
    draw_wgpu_texture_render_target_result(
        state,
        render_proxy.alpha,
        color_scale_bias.as_ref(),
        &render_proxy.transform_2d,
        &mut target.write().unwrap(),
        &identity,
    );
}

/// Registers the render-cache renderer on `state` (TS `enableWgpuRenderCache`).
pub fn enable_wgpu_render_cache(state: &mut WgpuRenderState) {
    register_render_cache_node_renderer(state, &WGPU_RENDER_CACHE_RENDERER);
}

/// Allocates or resizes the target `state` composites for `cache` (TS
/// `ensureWgpuRenderCacheTarget`), returning it so a caller can render custom content into it
/// directly. For engine-baked content prefer `refresh_wgpu_render_cache`.
pub fn ensure_wgpu_render_cache_target(
    state: &mut WgpuRenderState,
    cache: &RenderCache,
    width: f32,
    height: f32,
) -> Ref<WgpuTextureRenderTarget> {
    let key = get_entity_id(cache);
    if let Some(target) = get_wgpu_render_cache_target(state, cache) {
        resize_wgpu_texture_render_target(state, &mut target.write().unwrap(), width, height, None);
        return target;
    }
    let target = Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state, width, height, None, None, None,
    )));
    get_wgpu_render_cache_targets(state).push(WgpuRenderCacheTargetEntry {
        cache: key,
        target: target.clone(),
    });
    return target;
}

/// The target `state` composites for `cache`, or `None` (TS `getWgpuRenderCacheTarget`).
pub fn get_wgpu_render_cache_target(
    state: &WgpuRenderState,
    cache: &RenderCache,
) -> Option<Ref<WgpuTextureRenderTarget>> {
    let key = get_entity_id(cache);
    return get_scene2d_wgpu_runtime(state)?
        .render_cache_targets
        .as_ref()?
        .iter()
        .find(|entry| entry.cache == key)
        .map(|entry| entry.target.clone());
}

// The state's cache-target table, created on first use with a teardown that destroys every target
// the state still owns.
fn get_wgpu_render_cache_targets(
    state: &mut WgpuRenderState,
) -> &mut Vec<WgpuRenderCacheTargetEntry> {
    if ensure_scene2d_wgpu_runtime(state)
        .render_cache_targets
        .is_none()
    {
        register_wgpu_render_state_teardown(
            state,
            Arc::new(destroy_owned_wgpu_render_cache_targets),
        );
    }
    return ensure_scene2d_wgpu_runtime(state)
        .render_cache_targets
        .get_or_insert_with(Vec::new);
}

/// Bakes `source`'s subtree into its cache target through the offscreen `cache_state`, then records
/// the transform that places the result back in scene space (TS `refreshWgpuRenderCache`). Returns
/// whether a bake happened: the cache state's own dirtiness decides it, so this is cheap to call
/// every frame. The bake runs on the shared device inside the owner's frame.
// flight-lint: allow(conform-params) D17 the cache state's render proxies are an explicit caller-owned store
pub fn refresh_wgpu_render_cache(
    owner_state: &mut WgpuRenderState,
    cache_state: &mut WgpuRenderState,
    cache_proxies: &mut RenderProxies2D<WgpuRenderState>,
    cache: &Ref<RenderCache>,
    source: &NodeRef,
    options: Option<&RenderCacheRefreshOptions>,
) -> bool {
    let padding = options.and_then(|options| options.padding).unwrap_or(0.0);
    let min_width = options.and_then(|options| options.min_width).unwrap_or(1.0);
    let min_height = options
        .and_then(|options| options.min_height)
        .unwrap_or(1.0);

    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    compute_node_bounds_rectangle(
        &mut bounds,
        source,
        Some(source),
        &mut cache_state.render_runtime_mut().node_revisions,
    );
    let mut target_size = RenderTargetSize::default();
    let (width, height) = {
        let size = compute_render_target_size(
            &mut target_size,
            &bounds,
            Some(RenderTargetPadding::Uniform(padding)),
            Some(min_width),
            Some(min_height),
        );
        (size.width, size.height)
    };

    let existing = get_wgpu_render_cache_target(owner_state, &cache.read().unwrap());
    let resized = existing.is_none_or(|existing| {
        let existing = existing.read().unwrap();
        return existing.width as f32 != width || existing.height as f32 != height;
    });
    // The owner's targets are allocated before the frame borrow: the borrow lends only the encoder
    // and pass, and allocating storage records nothing into them.
    let target =
        ensure_wgpu_render_cache_target(owner_state, &cache.read().unwrap(), width, height);

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

    let mut y_invert = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    y_invert.d = -1.0;
    y_invert.ty = target.read().unwrap().height as f32;
    let mut bake_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    multiply_matrix(&mut bake_transform, &y_invert, &render_transform);

    return with_wgpu_frame_borrow(owner_state, cache_state, |cache_state| {
        let clear = RenderTargetClear {
            color: Some([0.0, 0.0, 0.0, 0.0]),
            colors: None,
            depth: Some(1.0),
            stencil: Some(0),
        };
        let mut pass = begin_wgpu_render_pass(
            cache_state,
            &WgpuRenderTarget::Texture(target),
            Some(&clear),
        );
        let dirty = prepare_scene_2d_render(pass.state, cache_proxies, source);
        if dirty || resized {
            render_wgpu_scene2d(&mut pass, cache_proxies, source, Some(&bake_transform));
        }
        end_wgpu_render_pass(pass);
        return dirty || resized;
    });
}

/// Destroys the target `state` holds for `cache` (TS `releaseWgpuRenderCache`): a texture target
/// owns GPU textures that dropping alone does not free promptly.
pub fn release_wgpu_render_cache(state: &mut WgpuRenderState, cache: &RenderCache) {
    let key = get_entity_id(cache);
    let Some(targets) = get_scene2d_wgpu_runtime_mut(state)
        .and_then(|runtime| runtime.render_cache_targets.as_mut())
    else {
        return;
    };
    let Some(index) = targets.iter().position(|entry| entry.cache == key) else {
        return;
    };
    let entry = targets.remove(index);
    destroy_wgpu_texture_render_target(&entry.target.read().unwrap());
}
