import type { WgpuRenderState, WgpuTextureRenderTarget } from '@flighthq/types/contract';
import type { WgpuEffectPipeline } from '@flighthq/types/contract';

import { createWgpuEffectPipeline, drawWgpuEffectPass } from './wgpuEffectPass';

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

// Emits source alpha for a destination-out erase pass; blend state supplies the coverage operator.
const ERASE_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(0.0, 0.0, 0.0, a);
}`;

/**
 * Blits source into dest at a pixel offset (dx, dy in screen-space Y-down).
 * Pixels sampling outside the source bounds produce transparent output.
 *
 * The shader samples `uv + offset`, so a screen-space shift of (+dx, +dy) needs the UV offset to
 * point in the opposite direction on both axes. In Wgpu UV space y=0 is at the top — the same
 * direction as screen space — so a downward shift (+dy) requires a negative UV offset (-dy/h),
 * unlike Gl where UV y=0 is at the bottom and the sign convention is reversed.
 */
export function applyWgpuEffectBlitOffsetPass(
  state: WgpuRenderState,
  source: WgpuTextureRenderTarget,
  dest: WgpuTextureRenderTarget,
  dx: number,
  dy: number,
): void {
  const pipeline = getWgpuBlitOffsetShader(state);
  drawWgpuEffectPass(state, source, dest, pipeline, (f32) => {
    f32[0] = -dx / source.width;
    f32[1] = -dy / source.height;
  });
}

/** Blits source directly into dest without modification. */
export function applyWgpuEffectBlitPass(
  state: WgpuRenderState,
  source: WgpuTextureRenderTarget,
  dest: WgpuTextureRenderTarget,
): void {
  const pipeline = getWgpuBlitShader(state);
  drawWgpuEffectPass(state, source, dest, pipeline, () => {});
}

/** Erases dest by the source alpha mask, equivalent to destination-out compositing. */
export function applyWgpuEffectErasePass(
  state: WgpuRenderState,
  source: WgpuTextureRenderTarget,
  dest: WgpuTextureRenderTarget,
): void {
  const pipeline = getWgpuEraseShader(state);
  drawWgpuEffectPass(state, source, dest, pipeline, () => {});
}

function getWgpuBlitOffsetShader(state: WgpuRenderState): WgpuEffectPipeline {
  let p = blitOffsetPipelines.get(state);
  if (p === undefined) {
    p = createWgpuEffectPipeline(state, BLIT_OFFSET_WGSL);
    blitOffsetPipelines.set(state, p);
  }
  return p;
}

function getWgpuBlitShader(state: WgpuRenderState): WgpuEffectPipeline {
  let p = blitPipelines.get(state);
  if (p === undefined) {
    p = createWgpuEffectPipeline(state, BLIT_WGSL);
    blitPipelines.set(state, p);
  }
  return p;
}

function getWgpuEraseShader(state: WgpuRenderState): WgpuEffectPipeline {
  let p = erasePipelines.get(state);
  if (p === undefined) {
    p = createWgpuEffectPipeline(state, ERASE_WGSL, 'erase');
    erasePipelines.set(state, p);
  }
  return p;
}

const blitOffsetPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
const blitPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
const erasePipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
