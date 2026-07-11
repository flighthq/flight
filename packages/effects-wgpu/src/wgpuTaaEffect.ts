import type { TaaEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// TAA: passthrough copy of source → dest. Real temporal AA needs a history buffer + motion vectors to
// reproject and accumulate prior frames; neither is available in the single-frame effect context, so
// this is a placeholder that preserves the pipeline stage without altering the image.
export function applyTaaEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  _effect: Readonly<TaaEffect>,
): void {
  const pipeline = getWgpuEffectPipeline(state, 'antialiasing.taa', TAA_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, _noopSetUniforms);
}

export const defaultWgpuTaaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as TaaEffect);
};

function _noopSetUniforms(): void {}

// TAA has no parameters, but the filter pass always binds a uniform buffer at group(0); the struct is
// declared and read (× 1.0) so the binding stays live and the bind-group layout matches.
const TAA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _pad0 : f32, _pad1 : f32, _pad2 : f32, _pad3 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(c.rgb, c.a + uni._pad0 * 0.0);
}`;
