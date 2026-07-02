import { computeBloomBlurRadius, computeBloomIntensity, computeBloomThreshold } from '@flighthq/effects';
import type { WgpuDualSourcePipeline } from '@flighthq/filters-wgpu';
import {
  applyGaussianBlurFilterToWgpu,
  createWgpuDualSourcePipeline,
  drawWgpuDualSourcePass,
  drawWgpuFilterPass,
} from '@flighthq/filters-wgpu';
import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  BloomEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Bloom: bright-pass → blur the bright branch (reusing the Tier-1 gaussian blur filter) → additively
// composite back. The multi-pass reference recipe — it acquires intermediate targets from the pool and
// releases them, branches, and reuses a filter, which is what makes it an effect and not a filter.
// The Wgpu mirror of effects-gl's applyBloomEffectToGl; identical parameters come from the
// shared computeBloomThreshold / computeBloomIntensity / computeBloomBlurRadius.
export function applyBloomEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<BloomEffect>,
): void {
  const threshold = computeBloomThreshold(effect);
  const intensity = computeBloomIntensity(effect);
  const radius = computeBloomBlurRadius(effect);
  const descriptor = { width: source.width, height: source.height, format: source.format };

  const bright = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurred = acquireWgpuRenderTarget(state, pool, descriptor);
  const temp = acquireWgpuRenderTarget(state, pool, descriptor);

  const brightPipeline = getWgpuEffectPipeline(state, 'bloom.bright', BLOOM_BRIGHT_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, bright, brightPipeline, (f32) => {
    f32[0] = threshold;
  });

  applyGaussianBlurFilterToWgpu(state, bright, blurred, temp, { blurX: radius, blurY: radius });

  const compositePipeline = getBloomCompositePipeline(state);
  drawWgpuDualSourcePass(
    state,
    source as WgpuRenderTarget,
    blurred,
    dest as WgpuRenderTarget,
    compositePipeline,
    (f32) => {
      f32[0] = intensity;
    },
  );

  releaseWgpuRenderTarget(pool, bright);
  releaseWgpuRenderTarget(pool, blurred);
  releaseWgpuRenderTarget(pool, temp);
}

export const defaultWgpuBloomEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyBloomEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as BloomEffect);
};

// The composite pipeline reads two textures (scene = group 1, blurred = group 2) so it uses the
// dual-source filter primitive; cached per state alongside the single-source pipelines.
function getBloomCompositePipeline(state: WgpuRenderState): WgpuDualSourcePipeline {
  let pipeline = _compositePipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWgpuDualSourcePipeline(state, BLOOM_COMPOSITE_FRAGMENT_WGSL, 'replace');
    _compositePipelines.set(state, pipeline);
  }
  return pipeline;
}

const _compositePipelines = new WeakMap<WgpuRenderState, WgpuDualSourcePipeline>();

const BLOOM_BRIGHT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_threshold : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let l = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let k = step(uni.u_threshold, l);
  return vec4f(c.rgb * k, c.a);
}`;

const BLOOM_COMPOSITE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex0 : texture_2d<f32>;
@group(1) @binding(1) var smp0 : sampler;
@group(2) @binding(0) var tex1 : texture_2d<f32>;
@group(2) @binding(1) var smp1 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(tex0, smp0, uv, 0.0);
  let bloom = textureSampleLevel(tex1, smp1, uv, 0.0);
  return vec4f(scene.rgb + bloom.rgb * uni.u_intensity, scene.a);
}`;
