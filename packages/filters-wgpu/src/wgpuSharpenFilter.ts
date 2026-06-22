import type { SharpenFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { applyBoxBlurFilterToWgpu } from './wgpuBlurFilter';
import type { WgpuDualSourcePipeline } from './wgpuFilterPass';
import { createWgpuDualSourcePipeline, drawWgpuDualSourcePass } from './wgpuFilterPass';

// Unsharp mask: sharpened = source + (source - blurred) * amount.
// source0 = original source (group 1), source1 = blurred (group 2).
//
// Uniforms layout (16 bytes):
//   offset 0: amount (f32)
//   offset 4-15: padding
const SHARPEN_WGSL = /* wgsl */ `
struct Uniforms {
  amount : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texSrc : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texBlurred : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let src = textureSampleLevel(texSrc, smp, uv, 0.0);
  let blurred = textureSampleLevel(texBlurred, smp2, uv, 0.0);
  return clamp(src + (src - blurred) * uni.amount, vec4f(0.0), vec4f(1.0));
}`;

const shaders = new WeakMap<WgpuRenderState, WgpuDualSourcePipeline>();

function getPipeline(state: WgpuRenderState): WgpuDualSourcePipeline {
  let p = shaders.get(state);
  if (p === undefined) {
    p = createWgpuDualSourcePipeline(state, SHARPEN_WGSL, 'replace');
    shaders.set(state, p);
  }
  return p;
}

/**
 * Sharpens `source` using an unsharp mask, writing to `dest`. `blurX`/`blurY`
 * are Gaussian standard deviations of the mask blur; `amount` controls strength.
 *
 * `scratch` must contain two render targets: one for the blurred image and one
 * for the blur's ping-pong temp. The filter allocates nothing itself.
 */
export function applySharpenFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  scratch: WgpuRenderTarget[],
  filter: Readonly<Omit<SharpenFilter, 'kind'>>,
): void {
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const amount = filter.amount ?? 1;

  const [blurred, blurTemp] = scratch;

  applyBoxBlurFilterToWgpu(state, source, blurred, blurTemp, {
    blurX: filter.blurX ?? 2,
    blurY: filter.blurY ?? 2,
    passes: quality,
  });

  const pipeline = getPipeline(state);
  drawWgpuDualSourcePass(state, source, blurred, dest, pipeline, (f32) => {
    f32[0] = amount;
  });
}
