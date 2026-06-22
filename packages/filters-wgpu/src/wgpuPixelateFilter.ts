import type { PixelateFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuFilterPipeline } from './wgpuFilterPass';
import { createWgpuFilterPipeline, drawWgpuFilterPass } from './wgpuFilterPass';

// Uniforms layout (16 bytes):
//   offset 0: blockTexelSize (vec2f)
//   offset 8: _pad (vec2f)
const PIXELATE_WGSL = /* wgsl */ `
struct Uniforms {
  blockTexelSize : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let block = floor(uv / uni.blockTexelSize) * uni.blockTexelSize;
  let center = clamp(block + uni.blockTexelSize * 0.5, vec2f(0.0), vec2f(1.0));
  return textureSampleLevel(tex, smp, center, 0.0);
}`;

const shaders = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();

function getPipeline(state: WgpuRenderState): WgpuFilterPipeline {
  let p = shaders.get(state);
  if (p === undefined) {
    p = createWgpuFilterPipeline(state, PIXELATE_WGSL, 'replace');
    shaders.set(state, p);
  }
  return p;
}

/**
 * Pixelates `source` into `dest` by averaging each block of `blockSize` pixels
 * into a single flat color. A single GPU pass — no scratch targets needed.
 */
export function applyPixelateFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  filter: Readonly<Omit<PixelateFilter, 'kind'>>,
): void {
  const blockSize = Math.max(1, filter.blockSize ?? 8);
  const pipeline = getPipeline(state);
  drawWgpuFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = blockSize / source.width;
    f32[1] = blockSize / source.height;
  });
}
