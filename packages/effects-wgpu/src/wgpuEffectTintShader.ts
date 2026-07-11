import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuDualSourceEffectPipeline, WgpuEffectPipeline } from './wgpuEffectPass';
import {
  createWgpuDualSourceEffectPipeline,
  createWgpuEffectPipeline,
  drawWgpuDualSourceEffectPass,
  drawWgpuEffectPass,
} from './wgpuEffectPass';

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

/** Clips glow against source alpha: output = glow × source.a. */
export function applyWgpuEffectInnerClipPass(
  state: WgpuRenderState,
  glow: WgpuRenderTarget,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
): void {
  const pipeline = getWgpuInnerClipShader(state);
  drawWgpuDualSourceEffectPass(state, glow, source, dest, pipeline, () => {});
}

/** Tints the INVERTED source alpha with color, outputs a premultiplied mask. Used for inner effects. */
export function applyWgpuEffectInvertTintPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const [r, g, b] = packColor(color);
  const pipeline = getWgpuInvertTintShader(state);
  drawWgpuEffectPass(state, source, dest, pipeline, (f32) => {
    f32[0] = r;
    f32[1] = g;
    f32[2] = b;
    f32[3] = alpha;
    f32[4] = strength;
  });
}

/** Tints the source alpha with color, outputs a premultiplied mask into dest. */
export function applyWgpuEffectTintPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const [r, g, b] = packColor(color);
  const pipeline = getWgpuTintShader(state);
  drawWgpuEffectPass(state, source, dest, pipeline, (f32) => {
    f32[0] = r;
    f32[1] = g;
    f32[2] = b;
    f32[3] = alpha;
    f32[4] = strength;
  });
}

function getWgpuInnerClipShader(state: WgpuRenderState): WgpuDualSourceEffectPipeline {
  let p = innerClipPipelines.get(state);
  if (p === undefined) {
    p = createWgpuDualSourceEffectPipeline(state, INNER_CLIP_WGSL);
    innerClipPipelines.set(state, p);
  }
  return p;
}

function getWgpuInvertTintShader(state: WgpuRenderState): WgpuEffectPipeline {
  let p = invertTintPipelines.get(state);
  if (p === undefined) {
    p = createWgpuEffectPipeline(state, INVERT_TINT_WGSL);
    invertTintPipelines.set(state, p);
  }
  return p;
}

function getWgpuTintShader(state: WgpuRenderState): WgpuEffectPipeline {
  let p = tintPipelines.get(state);
  if (p === undefined) {
    p = createWgpuEffectPipeline(state, TINT_WGSL);
    tintPipelines.set(state, p);
  }
  return p;
}

function packColor(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

const tintPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
const invertTintPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();

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

const innerClipPipelines = new WeakMap<WgpuRenderState, WgpuDualSourceEffectPipeline>();
