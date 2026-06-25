//! Per-state cache of compiled effect filter pipelines, keyed by a stable
//! string, plus the fullscreen filter-pass primitives the effect recipes draw
//! with — all layered on `flighthq-filters-wgpu`'s pass machinery.
//!
//! Effect recipes call [`get_wgpu_effect_pipeline`] with their own key +
//! fragment WGSL so each pipeline compiles once per state and is reused every
//! frame.  The WGSL is the fragment half only;
//! [`flighthq_filters_wgpu::create_wgpu_filter_pipeline`] prepends the shared
//! fullscreen-quad vertex ([`FILTER_VERTEX_WGSL`](flighthq_filters_wgpu::FILTER_VERTEX_WGSL)).
//! Mirrors the TS `getWgpuEffectPipeline`, which is itself a thin cache over
//! `createWgpuFilterPipeline` from `@flighthq/filters-wgpu`.
//!
//! Uniform-slot convention every recipe follows: the fragment declares a
//! `Uniforms` struct at `@group(0) @binding(0)` and a `texture_2d<f32>` +
//! `sampler` pair at `@group(1)`, packing its scalars into the slots written by
//! the filter pass's `set_uniforms` callback.  Dual-source recipes bind a
//! second `texture_2d<f32>` + `sampler` at `@group(2)`.
//!
//! This crate routes through `flighthq-filters-wgpu`: effects are layered on the
//! filter pass primitives exactly as TS effects-wgpu is layered on filters-wgpu.
//! The filters-wgpu per-context infrastructure ([`WgpuFilterState`]) is held
//! here in a per-state thread-local alongside the per-key pipeline cache — the
//! Rust analog of the TS `WeakMap<WgpuRenderState, ...>` filter-state cache —
//! and threaded explicitly into every `draw_wgpu_*` call.

use std::cell::RefCell;
use std::collections::HashMap;

use flighthq_filters_wgpu::{
    WgpuBlendMode, WgpuFilterPipeline, WgpuFilterState, apply_gaussian_blur_filter_to_wgpu,
    create_wgpu_dual_source_pipeline, create_wgpu_filter_pipeline, create_wgpu_filter_state,
    destroy_wgpu_filter_state, draw_wgpu_dual_source_views_pass, draw_wgpu_filter_pass,
};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

pub use flighthq_filters_wgpu::WgpuFilterPipeline as WgpuEffectPipeline;

// Re-export the filters-wgpu pipeline type so callers can name it through this
// crate; the effect cache stores and hands back filters-wgpu's pipeline.
pub use flighthq_filters_wgpu::FILTER_VERTEX_WGSL;

/// Blend mode a cached effect pipeline composites with.
///
/// Mirrors the TS `'replace' | 'premul'` string the effect recipes pass to
/// `getWgpuEffectPipeline`; maps onto filters-wgpu's [`WgpuBlendMode`].
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum WgpuEffectBlend {
    /// Overwrite the destination (most single-pass color recipes).
    #[default]
    Replace,
    /// Premultiplied-alpha over-composite (additive-style branches).
    Premultiplied,
}

impl WgpuEffectBlend {
    fn to_filter_blend(self) -> WgpuBlendMode {
        match self {
            WgpuEffectBlend::Replace => WgpuBlendMode::Replace,
            WgpuEffectBlend::Premultiplied => WgpuBlendMode::Premul,
        }
    }
}

/// Builds the full WGSL module a recipe fragment compiles into: the shared
/// fullscreen-quad vertex stage ([`FILTER_VERTEX_WGSL`]) followed by the
/// recipe's fragment source.
///
/// The vertex stage is filters-wgpu's quad vertex (the same one
/// `create_wgpu_filter_pipeline` prepends), so the WGSL this returns matches
/// what the cache actually compiles. Used by the recipe tests to assert their
/// fragment shaders compose with the shared vertex stage.
pub fn build_wgpu_effect_module_wgsl(fragment_wgsl: &str) -> String {
    format!("{FILTER_VERTEX_WGSL}{fragment_wgsl}")
}

/// Drops every cached effect filter pipeline and the filter state compiled for
/// `state`.
///
/// The cache is keyed by the state's pointer identity, so a state that is torn
/// down must clear its entry before its memory can be reused by a later state at
/// the same address — otherwise the new state would dispatch against pipelines,
/// uniform buffers, and a filter state owned by the dropped state's (freed)
/// device. Call this as part of tearing a state down, after its final submit.
pub fn clear_wgpu_effect_pipeline_cache(state: &WgpuRenderState) {
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        if let Some(mut entry) = cache.borrow_mut().remove(&state_id) {
            destroy_wgpu_filter_state(&mut entry.filter_state);
        }
    });
}

/// Draws a fullscreen dual-source filter pass: reads `source0` (`@group(1)`)
/// and `source1_view` (`@group(2)`), writes `dest` (or the canvas when `None`),
/// running the cached pipeline for `key`.
///
/// The second source is a [`wgpu::TextureView`] rather than a full render target
/// so callers can bind a raw G-buffer view (a velocity texture) that is not a
/// pooled render target — mirroring the TS recipe that wraps a `GPUTexture`
/// view as a minimal second source.
pub fn draw_wgpu_dual_source_effect_pass(
    state: &mut WgpuRenderState,
    key: &str,
    source0: &WgpuRenderTarget,
    source1_view: &wgpu::TextureView,
    dest: Option<&WgpuRenderTarget>,
    set_uniforms: impl FnOnce(&mut [f32; 32], &mut [i32; 32]),
) {
    let mut floats = [0.0f32; 32];
    let mut ints = [0i32; 32];
    set_uniforms(&mut floats, &mut ints);

    with_filter_pass(state, key, |state, filter_state, pipeline| {
        draw_wgpu_dual_source_views_pass(
            state,
            filter_state,
            &source0.view,
            source1_view,
            dest,
            pipeline,
            |slot| write_effect_uniforms(slot, &floats, &ints),
        );
    });
}

/// Draws a fullscreen single-source filter pass: reads `source` (`@group(1)`),
/// writes `dest` (or the canvas when `None`), running the cached pipeline for
/// `key`.  `set_uniforms` fills the recipe's uniform slots (a `[f32; 32]` and an
/// `[i32; 32]` view sharing one logical block) before the draw.
pub fn draw_wgpu_effect_filter_pass(
    state: &mut WgpuRenderState,
    key: &str,
    source: &WgpuRenderTarget,
    dest: Option<&WgpuRenderTarget>,
    set_uniforms: impl FnOnce(&mut [f32; 32], &mut [i32; 32]),
) {
    let mut floats = [0.0f32; 32];
    let mut ints = [0i32; 32];
    set_uniforms(&mut floats, &mut ints);

    with_filter_pass(state, key, |state, filter_state, pipeline| {
        draw_wgpu_filter_pass(state, filter_state, source, dest, pipeline, |slot| {
            write_effect_uniforms(slot, &floats, &ints)
        });
    });
}

/// Runs a separable Gaussian blur of `source` into `dest` (with `temp` scratch),
/// reusing filters-wgpu's `apply_gaussian_blur_filter_to_wgpu`.
///
/// `blur_x` / `blur_y` are Gaussian standard deviations. This is the seam the
/// bloom recipe blurs its bright branch through, exactly as the TS bloom recipe
/// calls `applyGaussianBlurFilterToWgpu` — the effect crate does not reimplement
/// the blur.
pub fn draw_wgpu_effect_gaussian_blur(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    temp: &WgpuRenderTarget,
    blur_x: f32,
    blur_y: f32,
) {
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let entry = cache
            .entry(state_id)
            .or_insert_with(|| EffectFilterCache::new(state));
        // SAFETY: the filter state lives in the thread-local cache, disjoint from
        // `state`; `draw_*` never re-enters the cache thread-local, so the
        // borrow of `entry` cannot alias `state` through any path.
        apply_gaussian_blur_filter_to_wgpu(
            state,
            &mut entry.filter_state,
            source,
            dest,
            temp,
            blur_x,
            blur_y,
        );
    });
}

/// Compiles (if needed) and caches the dual-source pipeline for `key` from
/// `fragment_wgsl` (binding two input textures: `@group(1)` + `@group(2)`).
///
/// Subsequent calls are a cheap cache lookup. Mirrors the per-state dual-source
/// pipeline `WeakMap` the TS recipes (bloom composite, motion blur) hold.
pub fn get_wgpu_dual_source_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
) {
    ensure_wgpu_effect_pipeline(state, key, fragment_wgsl, blend, 2);
}

/// Compiles (if needed) and caches the single-source pipeline for `key` from
/// `fragment_wgsl` (one input texture at `@group(1)`).
///
/// Subsequent calls are a cheap cache lookup. Mirrors the TS
/// `getWgpuEffectPipeline`.
pub fn get_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
) {
    ensure_wgpu_effect_pipeline(state, key, fragment_wgsl, blend, 1);
}

/// Compiles (if needed) and stores the pipeline for `key` in the per-state
/// cache, building it through filters-wgpu's `create_wgpu_filter_pipeline`
/// (single-source) or `create_wgpu_dual_source_pipeline` (`sources == 2`).
///
/// `sources` is the number of input texture groups (1 or 2). No-op when `key` is
/// already cached.
pub fn ensure_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: WgpuEffectBlend,
    sources: u32,
) {
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let entry = cache
            .entry(state_id)
            .or_insert_with(|| EffectFilterCache::new(state));
        if entry.pipelines.contains_key(key) {
            return;
        }
        let blend = blend.to_filter_blend();
        let pipeline = if sources >= 2 {
            create_wgpu_dual_source_pipeline(state, &entry.filter_state, fragment_wgsl, blend)
        } else {
            create_wgpu_filter_pipeline(state, &entry.filter_state, fragment_wgsl, blend)
        };
        entry.pipelines.insert(key.to_string(), pipeline);
    });
}

// Pulls the cached filter state + the pipeline for `key` out of the per-state
// cache and runs `draw` against them. The pipeline is moved out (so filters-wgpu
// can borrow it `&mut` for variant compilation alongside the `&mut filter_state`)
// and put back after. No-op when `key` is not cached — the caller compiles the
// pipeline first via `get_wgpu_effect_pipeline`.
fn with_filter_pass(
    state: &mut WgpuRenderState,
    key: &str,
    draw: impl FnOnce(&mut WgpuRenderState, &mut WgpuFilterState, &mut WgpuFilterPipeline),
) {
    let state_id = state as *const _ as usize;
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let Some(entry) = cache.get_mut(&state_id) else {
            return;
        };
        let Some(mut pipeline) = entry.pipelines.remove(key) else {
            return;
        };
        draw(state, &mut entry.filter_state, &mut pipeline);
        entry.pipelines.insert(key.to_string(), pipeline);
    });
}

// Translates the effect recipes' `[f32; 32]` / `[i32; 32]` slot convention into
// a filters-wgpu `WgpuUniformSlot`: write every float slot, then overlay any
// non-zero int slot. Each slot is filled as a float or an int, never both — the
// recipes choose per slot, matching their WGSL struct layout (the same rule the
// TS recipes follow with their aliased Float32Array / Int32Array).
fn write_effect_uniforms(
    slot: &mut flighthq_filters_wgpu::WgpuUniformSlot,
    floats: &[f32; 32],
    ints: &[i32; 32],
) {
    for (i, v) in floats.iter().enumerate() {
        slot.set_f32(i, *v);
    }
    for (i, v) in ints.iter().enumerate() {
        if *v != 0 {
            slot.set_i32(i, *v);
        }
    }
}

// Per-state filter infrastructure + compiled effect pipelines. Holds the
// filters-wgpu `WgpuFilterState` (uniform ring buffer, bind-group layouts,
// sampler, texture-bind-group cache) and the per-effect-key pipeline cache. One
// per `WgpuRenderState`, the Rust analog of the TS per-state filter-state
// `WeakMap` plus the per-key pipeline `Map`.
struct EffectFilterCache {
    filter_state: WgpuFilterState,
    pipelines: HashMap<String, WgpuFilterPipeline>,
}

impl EffectFilterCache {
    fn new(state: &WgpuRenderState) -> Self {
        EffectFilterCache {
            filter_state: create_wgpu_filter_state(state),
            pipelines: HashMap::new(),
        }
    }
}

thread_local! {
    // Per-state filter state + pipeline cache keyed by state pointer identity
    // (the Rust analog of the TS WeakMap<WgpuRenderState, ...>). Holds non-Send
    // wgpu objects, so a thread_local is the correct home (thread-confined, no
    // Send bound). `clear_wgpu_effect_pipeline_cache` frees the entry's GPU
    // buffers when a state is torn down.
    static CACHE: RefCell<HashMap<usize, EffectFilterCache>> = RefCell::new(HashMap::new());
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_wgpu_effect_module_wgsl

    #[test]
    fn build_wgpu_effect_module_wgsl_prepends_vertex_stage() {
        let fragment = "@fragment\nfn fs_main() -> @location(0) vec4f { return vec4f(1.0); }";
        let module = build_wgpu_effect_module_wgsl(fragment);
        // The shared fullscreen-quad vertex entry point is prepended.
        assert!(module.contains("fn vs_main"));
        assert!(module.contains("@builtin(vertex_index)"));
        // The recipe fragment is preserved verbatim after the vertex stage.
        assert!(module.contains("fn fs_main"));
        assert!(module.find("fn vs_main").unwrap() < module.find("fn fs_main").unwrap());
    }

    // WgpuEffectBlend

    #[test]
    fn wgpu_effect_blend_maps_to_filter_blend() {
        assert_eq!(
            WgpuEffectBlend::Replace.to_filter_blend(),
            WgpuBlendMode::Replace
        );
        assert_eq!(
            WgpuEffectBlend::Premultiplied.to_filter_blend(),
            WgpuBlendMode::Premul
        );
        // Default is Replace, matching the TS recipes' default blend.
        assert_eq!(WgpuEffectBlend::default(), WgpuEffectBlend::Replace);
    }

    // write_effect_uniforms

    #[test]
    fn write_effect_uniforms_writes_floats_then_overlays_nonzero_ints() {
        // GPU-guarded: building a real filter state needs an adapter. The slot
        // writes are validated by reading back the uniform bytes the slot fills.
        let Some(state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let mut filter_state = create_wgpu_filter_state(&state);
        let stride = filter_state.uniform_stride as usize;
        let bytes = &mut filter_state.uniform_data[0..stride];
        bytes.fill(0);
        let mut floats = [0.0f32; 32];
        let mut ints = [0i32; 32];
        floats[0] = 1.5;
        floats[1] = 2.0;
        ints[2] = 7; // int overlays slot 2
        {
            let mut slot = flighthq_filters_wgpu::WgpuUniformSlot::from_bytes(bytes);
            write_effect_uniforms(&mut slot, &floats, &ints);
        }
        let slot0 = f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let slot1 = f32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        let slot2 = i32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        assert_eq!(slot0, 1.5);
        assert_eq!(slot1, 2.0);
        assert_eq!(slot2, 7);
        destroy_wgpu_filter_state(&mut filter_state);
    }

    // clear_wgpu_effect_pipeline_cache

    #[test]
    fn clear_wgpu_effect_pipeline_cache_removes_state_entry() {
        // GPU-guarded: compiling a pipeline populates the per-state cache;
        // clearing must remove the state's entry so a reused state address
        // inherits no stale pipelines or filter state.
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let key = "test.passthrough";
        let fragment = "@fragment\nfn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }";
        get_wgpu_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace);
        let state_id = &state as *const _ as usize;
        assert!(CACHE.with(|c| c.borrow().contains_key(&state_id)));
        clear_wgpu_effect_pipeline_cache(&state);
        assert!(!CACHE.with(|c| c.borrow().contains_key(&state_id)));
    }

    // ensure_wgpu_effect_pipeline

    #[test]
    fn ensure_wgpu_effect_pipeline_caches_per_key() {
        // GPU-guarded: ensure compiles once and is idempotent per key.
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let key = "test.ensure";
        let fragment = "@fragment\nfn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }";
        ensure_wgpu_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace, 1);
        let state_id = &state as *const _ as usize;
        assert!(CACHE.with(|c| c.borrow()[&state_id].pipelines.contains_key(key)));
        // A second call is a no-op (still exactly one entry for the key).
        ensure_wgpu_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace, 1);
        assert!(CACHE.with(|c| c.borrow()[&state_id].pipelines.contains_key(key)));
        clear_wgpu_effect_pipeline_cache(&state);
    }

    // get_wgpu_dual_source_effect_pipeline

    #[test]
    fn get_wgpu_dual_source_effect_pipeline_compiles_two_source_pipeline() {
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let key = "test.dual";
        let fragment = "@group(0) @binding(0) var<uniform> uni : vec4f;\n@group(1) @binding(0) var t0 : texture_2d<f32>;\n@group(1) @binding(1) var s0 : sampler;\n@group(2) @binding(0) var t1 : texture_2d<f32>;\n@group(2) @binding(1) var s1 : sampler;\n@fragment\nfn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return textureSampleLevel(t0, s0, uv, 0.0) + textureSampleLevel(t1, s1, uv, 0.0); }";
        get_wgpu_dual_source_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace);
        let state_id = &state as *const _ as usize;
        assert!(CACHE.with(|c| {
            let c = c.borrow();
            c[&state_id].pipelines[key].source_groups == 2
        }));
        clear_wgpu_effect_pipeline_cache(&state);
    }

    // get_wgpu_effect_pipeline

    #[test]
    fn get_wgpu_effect_pipeline_compiles_single_source_pipeline() {
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let key = "test.single";
        let fragment = "@fragment\nfn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }";
        get_wgpu_effect_pipeline(&mut state, key, fragment, WgpuEffectBlend::Replace);
        let state_id = &state as *const _ as usize;
        assert!(CACHE.with(|c| {
            let c = c.borrow();
            c[&state_id].pipelines[key].source_groups == 1
        }));
        clear_wgpu_effect_pipeline_cache(&state);
    }

    // draw_wgpu_effect_filter_pass / draw_wgpu_dual_source_effect_pass / draw_wgpu_effect_gaussian_blur

    #[test]
    fn draw_wgpu_effect_filter_pass_is_noop_for_unknown_key() {
        // Drawing with a key that was never compiled is a no-op (the closure
        // still runs to fill uniforms, but no pass is encoded). GPU-guarded.
        let Some(mut state) = crate::test_support::try_create_test_wgpu_render_state() else {
            return;
        };
        let target =
            flighthq_render_wgpu::render_target::create_wgpu_render_target(&state, 16, 16, None);
        // No panic, no pass: there is no cache entry / pipeline for this key.
        draw_wgpu_effect_filter_pass(&mut state, "test.never-compiled", &target, None, |_, _| {});
        flighthq_render_wgpu::render_target::destroy_wgpu_render_target(&state, target);
        clear_wgpu_effect_pipeline_cache(&state);
    }
}
