import type { SsrEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// SSR: screen-space reflections. The real recipe ray-marches reflected rays against a sampleable DEPTH
// buffer using view-space normals, walking `steps` increments up to `maxDistance` at the given
// `resolution`; Wgpu has neither depth nor a normals attachment yet, so this is a passthrough copy
// that preserves the pipeline stage. maxDistance/resolution/steps are reserved for the depth-driven recipe.
export function applySsrEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  effect: Readonly<SsrEffect>,
): void {
  const pipeline = getWgpuEffectPipeline(state, 'atmospheric.ssr', SSR_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, () => {});
}

export const defaultWgpuSsrEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySsrEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SsrEffect);
};

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
