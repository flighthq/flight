import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuFilterPipeline } from './wgpuFilterPass';
import { createWgpuFilterPipeline, drawWgpuFilterPass } from './wgpuFilterPass';

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

const blitOffsetPipelines = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();
const blitPipelines = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();

/**
 * Blits source into dest at a pixel offset (dx, dy in screen-space Y-down).
 * Pixels sampling outside the source bounds produce transparent output.
 *
 * Note: the Y component of the offset is negated versus the Gl implementation
 * because Wgpu texture UV y=0 is top (matching screen y-down), whereas Gl
 * UV y=0 is bottom (opposite screen y-down).
 */
export function applyWgpuBlitOffsetPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  dx: number,
  dy: number,
): void {
  const pipeline = getWgpuBlitOffsetShader(state);
  drawWgpuFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = -dx / source.width;
    f32[1] = -dy / source.height;
  });
}

/** Blits source directly into dest without modification. */
export function applyWgpuBlitPass(state: WgpuRenderState, source: WgpuRenderTarget, dest: WgpuRenderTarget): void {
  const pipeline = getWgpuBlitShader(state);
  drawWgpuFilterPass(state, source, dest, pipeline, () => {});
}

export function getWgpuBlitOffsetShader(state: WgpuRenderState): WgpuFilterPipeline {
  let p = blitOffsetPipelines.get(state);
  if (p === undefined) {
    p = createWgpuFilterPipeline(state, BLIT_OFFSET_WGSL);
    blitOffsetPipelines.set(state, p);
  }
  return p;
}

export function getWgpuBlitShader(state: WgpuRenderState): WgpuFilterPipeline {
  let p = blitPipelines.get(state);
  if (p === undefined) {
    p = createWgpuFilterPipeline(state, BLIT_WGSL);
    blitPipelines.set(state, p);
  }
  return p;
}
