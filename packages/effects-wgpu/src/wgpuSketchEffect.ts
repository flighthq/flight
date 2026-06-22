import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { SketchEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Sketch: detect luminance edges and invert them into dark pencil strokes over a light page; `strength`
// scales how dark the strokes get.
export function applySketchEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<SketchEffect>,
): void {
  const strength = effect.strength ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.sketch', SKETCH_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = strength;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWgpuSketchEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySketchEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SketchEffect);
};

// Slot layout: [0]=strength, [1]=pad, [2..3]=resolution.
const SKETCH_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_strength : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn lum(uv : vec2f) -> f32 {
  return dot(textureSampleLevel(tex, smp, uv, 0.0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let tl = lum(uv + texel * vec2f(-1.0, -1.0));
  let t = lum(uv + texel * vec2f(0.0, -1.0));
  let tr = lum(uv + texel * vec2f(1.0, -1.0));
  let l = lum(uv + texel * vec2f(-1.0, 0.0));
  let rr = lum(uv + texel * vec2f(1.0, 0.0));
  let bl = lum(uv + texel * vec2f(-1.0, 1.0));
  let b = lum(uv + texel * vec2f(0.0, 1.0));
  let br = lum(uv + texel * vec2f(1.0, 1.0));
  let gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  let gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  let edge = sqrt(gx * gx + gy * gy);
  let pencil = clamp(1.0 - edge * uni.u_strength, 0.0, 1.0);
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(vec3f(pencil), a);
}`;
