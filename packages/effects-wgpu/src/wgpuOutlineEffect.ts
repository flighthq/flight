import type { OutlineEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Outline: Sobel edge detection on luminance; where the gradient magnitude exceeds `threshold`, mix
// the pixel toward the outline color by `thickness`. Color arrives packed RGBA, unpacked to 0..1 here.
export function applyOutlineEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<OutlineEffect>,
): void {
  const threshold = effect.threshold ?? 0.2;
  const thickness = effect.thickness ?? 1;
  const color = effect.color ?? 0x000000ff;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.outline', OUTLINE_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = threshold;
    f32[1] = thickness;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
    // u_color (vec4f) aligns to slot [4].
    f32[4] = r;
    f32[5] = g;
    f32[6] = b;
    f32[7] = a;
  });
}

export const defaultWgpuOutlineEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyOutlineEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as OutlineEffect);
};

// Slot layout: [0]=threshold, [1]=thickness, [2..3]=resolution, [4..7]=color rgba.
const OUTLINE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_threshold : f32,
  u_thickness : f32,
  u_resolution : vec2f,
  u_color : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn lum(uv : vec2f) -> f32 {
  return dot(textureSampleLevel(tex, smp, uv, 0.0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = uni.u_thickness / uni.u_resolution;
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
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let k = step(uni.u_threshold, edge);
  return mix(c, uni.u_color, k * uni.u_color.a);
}`;
