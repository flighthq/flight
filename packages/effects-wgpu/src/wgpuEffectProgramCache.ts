import type { WgpuRenderState } from '@flighthq/types';

import type { WgpuEffectPipeline } from './wgpuEffectPass';
import { createWgpuEffectPipeline } from './wgpuEffectPass';

// Per-state cache of compiled effect filter pipelines, keyed by a stable string. Effect recipes call
// getWgpuEffectPipeline with their own key + fragment WGSL so each pipeline compiles once per state
// and is reused every frame. The WGSL is the fragment half only; createWgpuEffectPipeline prepends
// the shared fullscreen-quad vertex (EFFECT_VERTEX_WGSL). Keeps compiled pipelines off the render-state
// runtime type. Mirrors effects-gl's getGlEffectProgram.
//
// Uniform-slot convention every recipe follows: the fragment declares
//   struct Uniforms { ... } @group(0) @binding(0) var<uniform> uni : Uniforms;
//   @group(1) @binding(0) var tex : texture_2d<f32>; @group(1) @binding(1) var smp : sampler;
// and packs its scalars into the f32/i32 slot written by drawWgpuEffectPass's setUniforms callback.

export function getWgpuEffectPipeline(
  state: WgpuRenderState,
  key: string,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'replace',
): WgpuEffectPipeline {
  let cache = _pipelines.get(state);
  if (cache === undefined) {
    cache = new Map();
    _pipelines.set(state, cache);
  }
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const compiled = createWgpuEffectPipeline(state, fragmentWGSL, blend);
  cache.set(key, compiled);
  return compiled;
}

const _pipelines = new WeakMap<WgpuRenderState, Map<string, WgpuEffectPipeline>>();
