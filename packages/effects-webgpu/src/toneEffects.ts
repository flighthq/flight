import { computeBloomBlurRadius } from '@flighthq/effects';
import type { WebGPUDualSourcePipeline } from '@flighthq/filters-webgpu';
import {
  applyGaussianBlurFilterToWebGPU,
  createWebGPUDualSourcePipeline,
  drawWebGPUDualSourcePass,
  drawWebGPUFilterPass,
} from '@flighthq/filters-webgpu';
import { acquireWebGPURenderTarget, releaseWebGPURenderTarget } from '@flighthq/render-webgpu';
import type {
  BloomEffect,
  ExposureEffect,
  ToneMapEffect,
  WebGPURenderEffectRunner,
  WebGPURenderState,
  WebGPURenderTarget,
  WebGPURenderTargetPool,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';

// Bloom: bright-pass → blur the bright branch (reusing the Tier-1 gaussian blur filter) → additively
// composite back. The multi-pass reference recipe — it acquires intermediate targets from the pool and
// releases them, branches, and reuses a filter, which is what makes it an effect and not a filter.
// The WebGPU mirror of effects-webgl's applyBloomEffectToWebGL; identical parameters come from the
// shared computeBloomBlurRadius.
export function applyBloomEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  pool: WebGPURenderTargetPool,
  effect: Readonly<BloomEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const radius = computeBloomBlurRadius(effect);
  const descriptor = { width: source.width, height: source.height, format: source.format };

  const bright = acquireWebGPURenderTarget(state, pool, descriptor);
  const blurred = acquireWebGPURenderTarget(state, pool, descriptor);
  const temp = acquireWebGPURenderTarget(state, pool, descriptor);

  const brightPipeline = getWebGPUEffectPipeline(state, 'bloom.bright', BLOOM_BRIGHT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, bright, brightPipeline, (f32) => {
    f32[0] = threshold;
  });

  applyGaussianBlurFilterToWebGPU(state, bright, blurred, temp, { blurX: radius, blurY: radius });

  const compositePipeline = getBloomCompositePipeline(state);
  drawWebGPUDualSourcePass(
    state,
    source as WebGPURenderTarget,
    blurred,
    dest as WebGPURenderTarget,
    compositePipeline,
    (f32) => {
      f32[0] = intensity;
    },
  );

  releaseWebGPURenderTarget(pool, bright);
  releaseWebGPURenderTarget(pool, blurred);
  releaseWebGPURenderTarget(pool, temp);
}

// Exposure: scale linear color by 2^stops. Single-pass reference recipe, the WebGPU mirror of
// effects-webgl's applyExposureEffectToWebGL. The stops are converted to a linear multiplier in JS.
export function applyExposureEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ExposureEffect>,
): void {
  const exposure = effect.exposure ?? 0;
  const multiplier = Math.pow(2, exposure);
  const pipeline = getWebGPUEffectPipeline(state, 'exposure', EXPOSURE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = multiplier;
  });
}

// Tone map: compress HDR to displayable range via the selected operator. Single-pass reference recipe,
// the WebGPU mirror of effects-webgl's applyToneMapEffectToWebGL. The operator selects a tonemap body
// that is compiled into the fragment once per state, keyed by operator name.
export function applyToneMapEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ToneMapEffect>,
): void {
  const operator = effect.operator ?? 'aces';
  const exposure = effect.exposure ?? 1;
  const white = effect.white ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, `toneMap.${operator}`, buildToneMapFragment(operator), 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = exposure;
    f32[1] = white;
  });
}

export const defaultWebGPUBloomEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyBloomEffectToWebGPU(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as BloomEffect);
};

export const defaultWebGPUExposureEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyExposureEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ExposureEffect);
};

export const defaultWebGPUToneMapEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyToneMapEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ToneMapEffect);
};

// The composite pipeline reads two textures (scene = group 1, blurred = group 2) so it uses the
// dual-source filter primitive; cached per state alongside the single-source pipelines.
function getBloomCompositePipeline(state: WebGPURenderState): WebGPUDualSourcePipeline {
  let pipeline = _compositePipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWebGPUDualSourcePipeline(state, BLOOM_COMPOSITE_FRAGMENT_WGSL, 'replace');
    _compositePipelines.set(state, pipeline);
  }
  return pipeline;
}

function buildToneMapFragment(operator: string): string {
  return TONEMAP_FRAGMENT_HEAD + (TONEMAP_OPERATORS[operator] ?? TONEMAP_OPERATORS.aces) + TONEMAP_FRAGMENT_TAIL;
}

const _compositePipelines = new WeakMap<WebGPURenderState, WebGPUDualSourcePipeline>();

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

// Slot [0]=multiplier (2^stops, precomputed in JS); the scalar struct pads to a 16-byte boundary.
const EXPOSURE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_exposure : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(c.rgb * uni.u_exposure, c.a);
}`;

// Slots [0]=exposure, [1]=white; the operator body is spliced between head and tail. The struct's two
// scalars pad to a 16-byte boundary.
const TONEMAP_FRAGMENT_HEAD = /* wgsl */ `
struct Uniforms { u_exposure : f32, u_white : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn tonemap(x : vec3f) -> vec3f {`;

const TONEMAP_FRAGMENT_TAIL = /* wgsl */ `}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let mapped = tonemap(c.rgb * uni.u_exposure);
  return vec4f(clamp(mapped, vec3f(0.0), vec3f(1.0)), c.a);
}`;

const TONEMAP_OPERATORS: Record<string, string> = {
  aces: `
  let a = x * (2.51 * x + 0.03);
  let b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;`,
  reinhard: `
  return x / (1.0 + x / (uni.u_white * uni.u_white));`,
  filmic: `
  let X = max(vec3f(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);`,
  uncharted2: `
  let A = 0.15; let B = 0.50; let C = 0.10; let D = 0.20; let E = 0.02; let F = 0.30;
  let v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;`,
  agx: `
  let v = clamp((x - 0.004) / (1.0 + x), vec3f(0.0), vec3f(1.0));
  return pow(v, vec3f(0.8));`,
};
