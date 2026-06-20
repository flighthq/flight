import { drawWebGPUFilterPass } from '@flighthq/filters-webgpu';
import type {
  GodRaysEffect,
  ScreenSpaceFogEffect,
  SSAOEffect,
  SSREffect,
  WebGPURenderEffectRunner,
  WebGPURenderState,
  WebGPURenderTarget,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';

// Atmospheric / depth recipes, the WGSL mirror of effects-webgl's atmosphericEffects. WebGPU does not
// produce a depth G-buffer yet (ctx.sceneDepthTexture is always null), so screenSpaceFog, ssao, and ssr
// ship the color-only approximations exactly like the effects-webgl versions — each documents the real
// depth-driven recipe at its definition. God rays is genuinely color-only by nature (radial light
// scattering), not a stand-in. Where neighbors are sampled (ssao) a u_resolution uniform is uploaded so
// texel steps are computed in a consistent space.

// God rays: radial light scattering from a screen-space light position (centerX, centerY). Marches
// SAMPLES steps along the ray from each fragment toward the light, accumulating color with per-step
// decay and weight, then scales by exposure. A true single-pass recipe — no depth needed. The sample
// count is baked into the WGSL (loop bound must be const) and keyed into the pipeline cache, so each
// distinct sample count compiles once.
export function applyGodRaysEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<GodRaysEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const density = effect.density ?? 0.96;
  const decay = effect.decay ?? 0.93;
  const weight = effect.weight ?? 0.4;
  const exposure = effect.exposure ?? 0.6;
  const samples = Math.max(1, Math.round(effect.samples ?? 64));
  const pipeline = getWebGPUEffectPipeline(
    state,
    `atmospheric.godRays.${samples}`,
    buildGodRaysFragment(samples),
    'replace',
  );
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = centerX;
    f32[1] = centerY;
    f32[2] = density;
    f32[3] = decay;
    f32[4] = weight;
    f32[5] = exposure;
  });
}

// Screen-space fog: blends the scene toward an unpacked fog color by a depth proxy. The real recipe
// reads a sampleable DEPTH texture per fragment — fog = 1 - exp(-density * remap(depth, near, far)) — but
// WebGPU has no depth G-buffer yet, so this color-only fallback uses the screen-Y gradient as the proxy
// (bottom of frame reads as "far"). near/far are reserved for the depth-driven recipe; density scales
// the proxy. color is a packed RGBA int unpacked to 0..1 floats on the JS side.
export function applyScreenSpaceFogEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ScreenSpaceFogEffect>,
): void {
  const packed = effect.color ?? 0xc8d2dcff;
  const r = ((packed >>> 24) & 0xff) / 255;
  const g = ((packed >>> 16) & 0xff) / 255;
  const b = ((packed >>> 8) & 0xff) / 255;
  const density = effect.density ?? 1;
  const pipeline = getWebGPUEffectPipeline(
    state,
    'atmospheric.screenSpaceFog',
    SCREEN_SPACE_FOG_FRAGMENT_WGSL,
    'replace',
  );
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = density;
    f32[4] = r;
    f32[5] = g;
    f32[6] = b;
  });
}

// SSAO: ambient-occlusion approximation. Real SSAO reconstructs view-space position/normals from a
// sampleable DEPTH texture and accumulates occlusion over `samples` kernel offsets within `radius`,
// gated by `bias`; WebGPU has no depth G-buffer yet, so none of that data exists. This stand-in darkens
// fragments by local luminance variation (high-contrast neighborhoods read as creases/contact) scaled
// by intensity, sampling neighbors via u_resolution-derived texel steps.
export function applySSAOEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<SSAOEffect>,
): void {
  const radius = effect.radius ?? 1;
  const intensity = effect.intensity ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'atmospheric.ssao', SSAO_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = radius;
    f32[1] = intensity;
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

// SSR: screen-space reflections. The real recipe ray-marches reflected rays against a sampleable DEPTH
// buffer using view-space normals, walking `steps` increments up to `maxDistance` at the given
// `resolution`; WebGPU has neither depth nor a normals attachment yet, so this is a passthrough copy
// that preserves the pipeline stage. maxDistance/resolution/steps are reserved for the depth-driven recipe.
export function applySSREffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  effect: Readonly<SSREffect>,
): void {
  const pipeline = getWebGPUEffectPipeline(state, 'atmospheric.ssr', SSR_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, () => {});
}

export const defaultWebGPUGodRaysEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyGodRaysEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as GodRaysEffect);
};

export const defaultWebGPUScreenSpaceFogEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyScreenSpaceFogEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ScreenSpaceFogEffect);
};

export const defaultWebGPUSSAOEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applySSAOEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as SSAOEffect);
};

export const defaultWebGPUSSREffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applySSREffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as SSREffect);
};

function buildGodRaysFragment(samples: number): string {
  return GOD_RAYS_FRAGMENT_HEAD + samples.toString() + GOD_RAYS_FRAGMENT_TAIL;
}

// Slot layout: [0]=centerX, [1]=centerY, [2]=density, [3]=decay, [4]=weight, [5]=exposure. All scalars
// pack into one vec4-aligned run, so no padding gaps are needed.
const GOD_RAYS_FRAGMENT_HEAD = /* wgsl */ `
struct Uniforms {
  u_centerX : f32,
  u_centerY : f32,
  u_density : f32,
  u_decay : f32,
  u_weight : f32,
  u_exposure : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = `;

const GOD_RAYS_FRAGMENT_TAIL = `;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let light = vec2f(uni.u_centerX, uni.u_centerY);
  let delta = (uv - light) * (uni.u_density / f32(SAMPLES));
  var coord = uv;
  let base = textureSampleLevel(tex, smp, uv, 0.0);
  var accum = base.rgb;
  var illumination = 1.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    coord = coord - delta;
    var s = textureSampleLevel(tex, smp, coord, 0.0).rgb;
    s = s * (illumination * uni.u_weight);
    accum = accum + s;
    illumination = illumination * uni.u_decay;
  }
  return vec4f(base.rgb + accum * uni.u_exposure, base.a);
}`;

// Slot layout: [0]=radius, [1]=intensity, [2]=resolution.x, [3]=resolution.y.
const SSAO_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_radius : f32,
  u_intensity : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = (1.0 / uni.u_resolution) * max(uni.u_radius, 1.0);
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lc = luma(center.rgb);
  var variation = 0.0;
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb));
  variation = variation * 0.25;
  let occlusion = clamp(variation * uni.u_intensity, 0.0, 1.0);
  return vec4f(center.rgb * (1.0 - occlusion), center.a);
}`;

const SSR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  _pad0 : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}`;

// Slot layout: [0]=density, [1..3]=pad, [4..6]=fog color rgb. The std140-style struct aligns the vec3
// color to a 16-byte boundary, so the JS writes skip slots [1..3].
const SCREEN_SPACE_FOG_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_density : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
  u_fogColor : vec3f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  // Color-only fallback: no depth G-buffer in WebGPU yet — screen-Y gradient as a depth proxy.
  // The real version reads depth and computes fog = 1 - exp(-density * remap(depth, near, far)).
  let fog = clamp((1.0 - uv.y) * uni.u_density, 0.0, 1.0);
  return vec4f(mix(c.rgb, uni.u_fogColor, fog), c.a);
}`;
