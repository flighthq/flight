import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuDualSourcePipeline, WgpuFilterPipeline } from './wgpuFilterPass';
import {
  createWgpuDualSourcePipeline,
  createWgpuFilterPipeline,
  drawWgpuDualSourcePass,
  drawWgpuFilterPass,
} from './wgpuFilterPass';

// Extracts the source alpha, tints it with a solid color, outputs premultiplied RGBA.
const TINT_WGSL = /* wgsl */ `
struct Uniforms {
  colorAlpha : vec4f,
  strength : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let a = min(1.0, textureSampleLevel(tex, smp, uv, 0.0).a * uni.colorAlpha.w * uni.strength);
  return vec4f(uni.colorAlpha.xyz * a, a);
}`;

// Extracts the INVERTED source alpha, tints it. Used for inner glow/shadow.
const INVERT_TINT_WGSL = /* wgsl */ `
struct Uniforms {
  colorAlpha : vec4f,
  strength : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let a = min(1.0, (1.0 - textureSampleLevel(tex, smp, uv, 0.0).a) * uni.colorAlpha.w * uni.strength);
  return vec4f(uni.colorAlpha.xyz * a, a);
}`;

const tintPipelines = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();
const invertTintPipelines = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();

/** Clips glow against source alpha: output = glow × source.a. */
export function applyWgpuInnerClipPass(
  state: WgpuRenderState,
  glow: WgpuRenderTarget,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
): void {
  const pipeline = getWgpuInnerClipShader(state);
  drawWgpuDualSourcePass(state, glow, source, dest, pipeline, () => {});
}

/** Tints the INVERTED source alpha with color, outputs a premultiplied mask. Used for inner effects. */
export function applyWgpuInvertTintPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const [r, g, b] = packColor(color);
  const pipeline = getWgpuInvertTintShader(state);
  drawWgpuFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = r;
    f32[1] = g;
    f32[2] = b;
    f32[3] = alpha;
    f32[4] = strength;
  });
}

/** Tints the source alpha with color, outputs a premultiplied mask into dest. */
export function applyWgpuTintPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const [r, g, b] = packColor(color);
  const pipeline = getWgpuTintShader(state);
  drawWgpuFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = r;
    f32[1] = g;
    f32[2] = b;
    f32[3] = alpha;
    f32[4] = strength;
  });
}

export function getWgpuInnerClipShader(state: WgpuRenderState): WgpuDualSourcePipeline {
  let p = innerClipPipelines.get(state);
  if (p === undefined) {
    p = createWgpuDualSourcePipeline(state, INNER_CLIP_WGSL);
    innerClipPipelines.set(state, p);
  }
  return p;
}

export function getWgpuInvertTintShader(state: WgpuRenderState): WgpuFilterPipeline {
  let p = invertTintPipelines.get(state);
  if (p === undefined) {
    p = createWgpuFilterPipeline(state, INVERT_TINT_WGSL);
    invertTintPipelines.set(state, p);
  }
  return p;
}

export function getWgpuTintShader(state: WgpuRenderState): WgpuFilterPipeline {
  let p = tintPipelines.get(state);
  if (p === undefined) {
    p = createWgpuFilterPipeline(state, TINT_WGSL);
    tintPipelines.set(state, p);
  }
  return p;
}

function packColor(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

// Inner-clip dual-source pipeline: clips unit-1 glow to unit-2 source alpha.
// Used by inner glow and inner shadow.
const INNER_CLIP_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texGlow : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texSrc : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let glow = textureSampleLevel(texGlow, smp, uv, 0.0);
  let srcAlpha = textureSampleLevel(texSrc, smp2, uv, 0.0).a;
  return glow * srcAlpha;
}`;

const innerClipPipelines = new WeakMap<WgpuRenderState, WgpuDualSourcePipeline>();
