import type {
  BokehDepthOfFieldEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Bokeh depth-of-field: a disc-shaped blur. The real DoF computes a per-pixel circle of confusion from a
// sampleable depth texture (focusDistance/focusRange) and scales the disc radius by it — but Wgpu does
// not produce a scene depth texture yet (ctx.sceneDepthTexture is null), so there is no second source to
// bind here. This recipe always falls back to a uniform disc blur of radius maxBlur. When the depth seam
// lands it can take a depth source as group 2 and recover the true circle of confusion, matching
// effects-gl's applyBokehDepthOfFieldEffectToGl.
export function applyBokehDepthOfFieldEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<BokehDepthOfFieldEffect>,
): void {
  const maxBlur = effect.maxBlur ?? 4;
  const width = source.width;
  const height = source.height;
  const pipeline = getWgpuEffectPipeline(state, 'lens.bokehDoF', BOKEH_DOF_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = maxBlur;
    f32[2] = width;
    f32[3] = height;
  });
}

export const defaultWgpuBokehDepthOfFieldEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyBokehDepthOfFieldEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as BokehDepthOfFieldEffect);
};

// Slot layout: [0]=maxBlur, [1]=pad, [2..3]=resolution (vec2 aligned to 8 bytes). With no depth source
// the circle of confusion is fixed at 1.0, so the disc samples the full maxBlur radius everywhere.
const BOKEH_DOF_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_maxBlur : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = vec2f(1.0) / uni.u_resolution;
  // No depth texture in WebGPU yet: circle of confusion is fixed, so the disc uses the full radius.
  let blur = uni.u_maxBlur;
  var sum = vec4f(0.0);
  var total = 0.0;
  for (var i = 0; i < 16; i = i + 1) {
    let ang = f32(i) * 0.39269908; // golden-ish angular step over the disc
    let rad = (f32(i % 4) + 1.0) * 0.25;
    let offset = vec2f(cos(ang), sin(ang)) * rad * blur * texel;
    sum = sum + textureSampleLevel(tex, smp, uv + offset, 0.0);
    total = total + 1.0;
  }
  return sum / total;
}`;
