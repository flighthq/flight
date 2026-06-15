import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import type { WebGPUDualSourcePipeline, WebGPUFilterPipeline } from './filterPass';
import {
  createWebGPUDualSourcePipeline,
  createWebGPUFilterPipeline,
  drawWebGPUDualSourcePass,
  drawWebGPUFilterPass,
} from './filterPass';

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

// Blits a texture at a UV offset. Out-of-bounds samples produce transparent output.
const BLIT_OFFSET_WGSL = /* wgsl */ `
struct Uniforms {
  offset : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let shifted = uv + uni.offset;
  if (shifted.x < 0.0 || shifted.x > 1.0 || shifted.y < 0.0 || shifted.y > 1.0) {
    return vec4f(0.0);
  }
  return textureSampleLevel(tex, smp, shifted, 0.0);
}`;

// Pass-through blit. Minimal uniform struct required by the pipeline layout.
const BLIT_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}`;

const tintPipelines = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();
const invertTintPipelines = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();
const blitOffsetPipelines = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();
const blitPipelines = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();

/**
 * Blits source into dest at a pixel offset (dx, dy in screen-space Y-down).
 * Pixels sampling outside the source bounds produce transparent output.
 *
 * Note: the Y component of the offset is negated versus the WebGL implementation
 * because WebGPU texture UV y=0 is top (matching screen y-down), whereas WebGL
 * UV y=0 is bottom (opposite screen y-down).
 */
export function applyBlitOffsetPassWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  dx: number,
  dy: number,
): void {
  const pipeline = getBlitOffsetShaderWebGPU(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = -dx / source.width;
    f32[1] = -dy / source.height;
  });
}

/** Blits source directly into dest without modification. */
export function applyBlitPassWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
): void {
  const pipeline = getBlitShaderWebGPU(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, () => {});
}

/** Clips glow against source alpha: output = glow × source.a. */
export function applyInnerClipPass(
  state: WebGPURenderState,
  glow: WebGPURenderTarget,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
): void {
  const pipeline = getInnerClipShader(state);
  drawWebGPUDualSourcePass(state, glow, source, dest, pipeline, () => {});
}

/** Tints the INVERTED source alpha with color, outputs a premultiplied mask. Used for inner effects. */
export function applyInvertTintPassWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const [r, g, b] = packColor(color);
  const pipeline = getInvertTintShaderWebGPU(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = r;
    f32[1] = g;
    f32[2] = b;
    f32[3] = alpha;
    f32[4] = strength;
  });
}

function packColor(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

/** Tints the source alpha with color, outputs a premultiplied mask into dest. */
export function applyTintPassWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const [r, g, b] = packColor(color);
  const pipeline = getTintShaderWebGPU(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = r;
    f32[1] = g;
    f32[2] = b;
    f32[3] = alpha;
    f32[4] = strength;
  });
}

export function getBlitOffsetShaderWebGPU(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = blitOffsetPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, BLIT_OFFSET_WGSL);
    blitOffsetPipelines.set(state, p);
  }
  return p;
}

export function getBlitShaderWebGPU(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = blitPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, BLIT_WGSL);
    blitPipelines.set(state, p);
  }
  return p;
}

export function getInnerClipShader(state: WebGPURenderState): WebGPUDualSourcePipeline {
  let p = innerClipPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUDualSourcePipeline(state, INNER_CLIP_WGSL);
    innerClipPipelines.set(state, p);
  }
  return p;
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

const innerClipPipelines = new WeakMap<WebGPURenderState, WebGPUDualSourcePipeline>();

export function getInvertTintShaderWebGPU(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = invertTintPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, INVERT_TINT_WGSL);
    invertTintPipelines.set(state, p);
  }
  return p;
}

export function getTintShaderWebGPU(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = tintPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, TINT_WGSL);
    tintPipelines.set(state, p);
  }
  return p;
}
