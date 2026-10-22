// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: cached pipelines hold host-supplied wgpu resources
//! Per-state cache of compiled effect pipelines keyed by a stable string (TS
//! `wgpuEffectProgramCache.ts`). Recipes call `get_wgpu_effect_pipeline` with their own key and
//! fragment WGSL so each pipeline compiles once per state and is reused every frame.
//!
//! Uniform-slot convention every recipe follows: the fragment declares
//! `struct Uniforms { ... } @group(0) @binding(0) var<uniform> uni : Uniforms;` plus
//! `@group(1) @binding(0) var tex : texture_2d<f32>; @group(1) @binding(1) var smp : sampler;` and
//! packs its scalars into the slot `draw_wgpu_effect_pass` hands its uniform writer.

use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_render_wgpu::WgpuRenderState;

use crate::types::*;
use crate::wgpu_effect_pass::create_wgpu_effect_pipeline;
use crate::wgpu_effect_runtime::get_wgpu_effect_runtime;

/// The pipeline cached under `key` on this state, compiling `fragment_wgsl` on first request (TS
/// `getWgpuEffectPipeline`). The key identifies the pipeline: the first request fixes its WGSL and
/// blend mode (`blend` defaults to replace) for every later one.
pub fn get_wgpu_effect_pipeline(
    state: &mut WgpuRenderState,
    key: &str,
    fragment_wgsl: &str,
    blend: Option<WgpuEffectBlendMode>,
) -> Ref<WgpuEffectPipeline> {
    if let Some(existing) = get_wgpu_effect_runtime(state).program_pipelines.get(key) {
        return existing.clone();
    }
    let compiled = create_wgpu_effect_pipeline(
        state,
        fragment_wgsl,
        Some(blend.unwrap_or(WgpuEffectBlendMode::Replace)),
    );
    let pipeline: Ref<WgpuEffectPipeline> = Arc::new(RwLock::new(compiled));
    get_wgpu_effect_runtime(state)
        .program_pipelines
        .insert(key.to_string(), pipeline.clone());
    return pipeline;
}
