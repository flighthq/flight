import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu/contract';
import type {
  LensDirtEffect,
  WgpuDualSourceEffectPipeline,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types/contract';

import { applyGaussianBlurToWgpu } from './wgpuBlurEffect';
import { createWgpuDualSourceEffectPipeline, drawWgpuDualSourceEffectPass, drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

// Lens dirt: isolate bright energy, spread it spatially, then admit it through a procedural smudge mask.
// The bright branch must blur before the mask: masking only the source pixel cannot carry any energy
// into the dark background, reducing this spatial effect to a pointwise highlight boost.
export function applyLensDirtEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<LensDirtEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const threshold = effect.threshold ?? 0.55;
  const seed = effect.seed ?? 0;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const bright = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurred = acquireWgpuRenderTarget(state, pool, descriptor);
  const temp = acquireWgpuRenderTarget(state, pool, descriptor);

  const brightPipeline = getWgpuEffectPipeline(
    state,
    'lens.lensDirt.bright',
    LENS_DIRT_BRIGHT_FRAGMENT_WGSL,
    'replace',
  );
  drawWgpuEffectPass(state, source as WgpuRenderTarget, bright, brightPipeline, (f32) => {
    f32[0] = threshold;
  });

  applyGaussianBlurToWgpu(state, bright, blurred, temp, {
    blurX: LENS_DIRT_BLUR_SIGMA,
    blurY: LENS_DIRT_BLUR_SIGMA,
  });

  drawWgpuDualSourceEffectPass(
    state,
    source as WgpuRenderTarget,
    blurred,
    dest as WgpuRenderTarget,
    getLensDirtCompositePipeline(state),
    (f32) => {
      f32[0] = intensity;
      f32[1] = seed;
    },
  );

  releaseWgpuRenderTarget(pool, bright);
  releaseWgpuRenderTarget(pool, blurred);
  releaseWgpuRenderTarget(pool, temp);
}

export const defaultWgpuLensDirtEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as LensDirtEffect);
};

export function registerWgpuLensDirtEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'LensDirtEffect', defaultWgpuLensDirtEffectRunner);
}

function getLensDirtCompositePipeline(state: WgpuRenderState): WgpuDualSourceEffectPipeline {
  let pipeline = _compositePipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWgpuDualSourceEffectPipeline(state, LENS_DIRT_COMPOSITE_FRAGMENT_WGSL, 'replace');
    _compositePipelines.set(state, pipeline);
  }
  return pipeline;
}

const LENS_DIRT_BRIGHT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_threshold : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.299, 0.587, 0.114));
  let bright = max(0.0, lum - uni.u_threshold);
  return vec4f(c.rgb * (bright / max(lum, 0.00001)), c.a);
}`;

const LENS_DIRT_COMPOSITE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_seed : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var sceneTex : texture_2d<f32>;
@group(1) @binding(1) var sceneSmp : sampler;
@group(2) @binding(0) var brightTex : texture_2d<f32>;
@group(2) @binding(1) var brightSmp : sampler;

fn dirtHash(p : vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123); }

fn dirtAmount(uv : vec2f, seed : f32) -> f32 {
  var acc = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    let c = vec2f(dirtHash(vec2f(fi, seed)), dirtHash(vec2f(fi + 9.0, seed)));
    let r = 0.06 + 0.16 * dirtHash(vec2f(fi + 3.0, seed));
    let d = distance(uv, c) / r;
    acc = acc + smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2f(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(sceneTex, sceneSmp, uv, 0.0);
  let bright = textureSampleLevel(brightTex, brightSmp, uv, 0.0).rgb;
  let dirt = dirtAmount(uv, uni.u_seed + 1.0);
  return vec4f(scene.rgb + bright * dirt * uni.u_intensity * 2.0, scene.a);
}`;

// Lens dirt is a broad optical contamination layer; sigma 8 matches the default bloom spread while
// keeping its extent independent from the procedural blob sizes, which control the mask rather than light transport.
const LENS_DIRT_BLUR_SIGMA = 8;

const _compositePipelines = new WeakMap<WgpuRenderState, WgpuDualSourceEffectPipeline>();
