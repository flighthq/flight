import type {
  AdvancedBlendMode,
  BlendEffect,
  WgpuDualSourceEffectPipeline,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types/contract';
import { AdvancedBlendMode as AdvancedBlendModeValues } from '@flighthq/types/contract';

import { createWgpuDualSourceEffectPipeline, drawWgpuDualSourceEffectPass } from './wgpuEffectPass';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

// Advanced-blend composite pass: reads the incoming layer and an explicitly registered backdrop,
// applies the same W3C straight-color blend math as glBlendEffect, then writes premultiplied
// source-over output. A missing backdrop uses the layer as a harmless second binding and the uniform
// gate reduces the operation to passthrough.
export function applyBlendEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<BlendEffect>,
): void {
  const backdrop = getWgpuBlendEffectBackdrop(state, effect.backdropKey ?? null);
  const pipeline = getWgpuBlendEffectPipeline(state);
  const modeIndex = getWgpuBlendEffectModeIndex(effect.mode);
  const hasBackdrop = backdrop !== null;
  drawWgpuDualSourceEffectPass(
    state,
    source as WgpuRenderTarget,
    (backdrop ?? source) as WgpuRenderTarget,
    dest as WgpuRenderTarget,
    pipeline,
    (f32, i32) => {
      i32[0] = modeIndex;
      f32[1] = effect.opacity ?? 1;
      i32[2] = hasBackdrop ? 1 : 0;
    },
  );
}

export const defaultWgpuBlendEffectRunner: WgpuRenderEffectRunner = (context, effect) => {
  applyBlendEffectToWgpu(context.state, context.source, context.dest, effect as BlendEffect);
};

// Returns the borrowed backdrop target registered under a key on this state, or null when absent.
export function getWgpuBlendEffectBackdrop(
  state: WgpuRenderState,
  backdropKey: string | null,
): WgpuRenderTarget | null {
  if (backdropKey === null) return null;
  return backdrops.get(state)?.get(backdropKey) ?? null;
}

// Maps the open AdvancedBlendMode value to the shared shader branch order. Unknown vendor values map
// to -1, whose shader fallback is Normal source color.
export function getWgpuBlendEffectModeIndex(mode: AdvancedBlendMode): number {
  return BLEND_MODE_INDEX[mode] ?? -1;
}

export function registerWgpuBlendEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'BlendEffect', defaultWgpuBlendEffectRunner);
}

// Registers a borrowed render target as a named backdrop. Last write wins; the registry never owns or
// destroys the target, so its caller must keep it alive until the BlendEffect pass completes.
export function registerWgpuBlendEffectBackdrop(
  state: WgpuRenderState,
  backdropKey: string,
  target: WgpuRenderTarget,
): void {
  let registry = backdrops.get(state);
  if (registry === undefined) {
    registry = new Map();
    backdrops.set(state, registry);
  }
  registry.set(backdropKey, target);
}

// Removes a borrowed backdrop reference without destroying the target.
export function unregisterWgpuBlendEffectBackdrop(state: WgpuRenderState, backdropKey: string): boolean {
  return backdrops.get(state)?.delete(backdropKey) ?? false;
}

function getWgpuBlendEffectPipeline(state: WgpuRenderState): WgpuDualSourceEffectPipeline {
  let pipeline = pipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWgpuDualSourceEffectPipeline(state, WGPU_BLEND_FRAGMENT_WGSL, 'replace');
    pipelines.set(state, pipeline);
  }
  return pipeline;
}

const BLEND_MODE_INDEX: Readonly<Record<string, number>> = {
  [AdvancedBlendModeValues.Overlay]: 0,
  [AdvancedBlendModeValues.HardLight]: 1,
  [AdvancedBlendModeValues.SoftLight]: 2,
  [AdvancedBlendModeValues.Difference]: 3,
  [AdvancedBlendModeValues.Exclusion]: 4,
  [AdvancedBlendModeValues.ColorDodge]: 5,
  [AdvancedBlendModeValues.ColorBurn]: 6,
  [AdvancedBlendModeValues.Hue]: 7,
  [AdvancedBlendModeValues.Saturation]: 8,
  [AdvancedBlendModeValues.Color]: 9,
  [AdvancedBlendModeValues.Luminosity]: 10,
  [AdvancedBlendModeValues.Darken]: 11,
  [AdvancedBlendModeValues.Lighten]: 12,
};

const backdrops = new WeakMap<WgpuRenderState, Map<string, WgpuRenderTarget>>();
const pipelines = new WeakMap<WgpuRenderState, WgpuDualSourceEffectPipeline>();

// Layer and backdrop are premultiplied textures. Blend math operates on straight RGB, follows the W3C
// compositing formulas used by effects/blendModeMath and glBlendEffect, then premultiplies the result.
export const WGPU_BLEND_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  mode : i32,
  opacity : f32,
  hasBackdrop : i32,
  _pad0 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var layerTexture : texture_2d<f32>;
@group(1) @binding(1) var layerSampler : sampler;
@group(2) @binding(0) var backdropTexture : texture_2d<f32>;
@group(2) @binding(1) var backdropSampler : sampler;

fn lum(c : vec3f) -> f32 {
  return dot(c, vec3f(0.3, 0.59, 0.11));
}

fn sat(c : vec3f) -> f32 {
  return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}

fn clipColor(inputColor : vec3f) -> vec3f {
  var c = inputColor;
  let l = lum(c);
  let mn = min(min(c.r, c.g), c.b);
  let mx = max(max(c.r, c.g), c.b);
  if (mn < 0.0) {
    c = vec3f(l) + (c - vec3f(l)) * l / (l - mn);
  }
  if (mx > 1.0) {
    c = vec3f(l) + (c - vec3f(l)) * (1.0 - l) / (mx - l);
  }
  return c;
}

fn setLum(c : vec3f, l : f32) -> vec3f {
  return clipColor(c + vec3f(l - lum(c)));
}

fn setSat(c : vec3f, s : f32) -> vec3f {
  let mn = min(min(c.r, c.g), c.b);
  let mx = max(max(c.r, c.g), c.b);
  let md = c.r + c.g + c.b - mn - mx;
  let rmid = select(0.0, (md - mn) * s / (mx - mn), mx > mn);
  let rmax = select(0.0, s, mx > mn);
  var out = vec3f(0.0);
  out.r = select(select(rmid, 0.0, c.r == mn), rmax, c.r == mx);
  out.g = select(select(rmid, 0.0, c.g == mn), rmax, c.g == mx);
  out.b = select(select(rmid, 0.0, c.b == mn), rmax, c.b == mx);
  return out;
}

fn sepChannel(mode : i32, cb : f32, cs : f32) -> f32 {
  if (mode == 0) {
    return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cb <= 0.5);
  }
  if (mode == 1) {
    return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cs <= 0.5);
  }
  if (mode == 2) {
    let d = select(sqrt(cb), ((16.0 * cb - 12.0) * cb + 4.0) * cb, cb <= 0.25);
    return select(cb + (2.0 * cs - 1.0) * (d - cb), cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb), cs <= 0.5);
  }
  if (mode == 3) { return abs(cb - cs); }
  if (mode == 4) { return cb + cs - 2.0 * cb * cs; }
  if (mode == 5) {
    if (cb <= 0.0) { return 0.0; }
    return select(min(1.0, cb / (1.0 - cs)), 1.0, cs >= 1.0);
  }
  if (mode == 6) {
    if (cb >= 1.0) { return 1.0; }
    return select(1.0 - min(1.0, (1.0 - cb) / cs), 0.0, cs <= 0.0);
  }
  if (mode == 11) { return min(cb, cs); }
  if (mode == 12) { return max(cb, cs); }
  return cs;
}

fn blendRgb(mode : i32, cb : vec3f, cs : vec3f) -> vec3f {
  if (mode == 7) { return setLum(setSat(cs, sat(cb)), lum(cb)); }
  if (mode == 8) { return setLum(setSat(cb, sat(cs)), lum(cb)); }
  if (mode == 9) { return setLum(cs, lum(cb)); }
  if (mode == 10) { return setLum(cb, lum(cs)); }
  return vec3f(
    sepChannel(mode, cb.r, cs.r),
    sepChannel(mode, cb.g, cs.g),
    sepChannel(mode, cb.b, cs.b),
  );
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let layer = textureSampleLevel(layerTexture, layerSampler, uv, 0.0);
  if (uni.hasBackdrop == 0) {
    return layer;
  }
  let back = textureSampleLevel(backdropTexture, backdropSampler, uv, 0.0);
  let cs = select(vec3f(0.0), layer.rgb / layer.a, layer.a > 0.0);
  let cb = select(vec3f(0.0), back.rgb / back.a, back.a > 0.0);
  let sourceAlpha = layer.a * uni.opacity;
  let backdropAlpha = back.a;
  let blended = blendRgb(uni.mode, cb, cs);
  let mixed = (1.0 - backdropAlpha) * cs + backdropAlpha * blended;
  let outAlpha = sourceAlpha + backdropAlpha * (1.0 - sourceAlpha);
  let outRgb = mixed * sourceAlpha + cb * backdropAlpha * (1.0 - sourceAlpha);
  return vec4f(outRgb, outAlpha);
}
`;
