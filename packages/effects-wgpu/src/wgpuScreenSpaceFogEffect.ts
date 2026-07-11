import type { ScreenSpaceFogEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Screen-space fog: blends the scene toward an unpacked fog color by a depth proxy. The real recipe
// reads a sampleable DEPTH texture per fragment — fog = 1 - exp(-density * remap(depth, near, far)) — but
// Wgpu has no depth G-buffer yet, so this color-only fallback uses the screen-Y gradient as the proxy
// (bottom of frame reads as "far"). near/far are reserved for the depth-driven recipe; density scales
// the proxy. color is a packed RGBA int unpacked to 0..1 floats on the JS side.
export function applyScreenSpaceFogEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ScreenSpaceFogEffect>,
): void {
  const packed = effect.color ?? 0xc8d2dcff;
  const r = ((packed >>> 24) & 0xff) / 255;
  const g = ((packed >>> 16) & 0xff) / 255;
  const b = ((packed >>> 8) & 0xff) / 255;
  const density = effect.density ?? 1;
  const pipeline = getWgpuEffectPipeline(
    state,
    'atmospheric.screenSpaceFog',
    SCREEN_SPACE_FOG_FRAGMENT_WGSL,
    'replace',
  );
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = density;
    f32[4] = r;
    f32[5] = g;
    f32[6] = b;
  });
}

export const defaultWgpuScreenSpaceFogEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyScreenSpaceFogEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ScreenSpaceFogEffect);
};

// Slot layout: [0]=density, [1..3]=pad, [4..6]=fog color rgb. The std140-style struct aligns the vec3
// color to a 16-byte boundary, so the JS writes skip slots [1..3].
const SCREEN_SPACE_FOG_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_density : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
  u_fogColor : vec3f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  // Color-only fallback: no depth G-buffer in Wgpu yet — screen-Y gradient as a depth proxy.
  // The real version reads depth and computes fog = 1 - exp(-density * remap(depth, near, far)).
  let fog = clamp((1.0 - uv.y) * uni.u_density, 0.0, 1.0);
  return vec4f(mix(c.rgb, uni.u_fogColor, fog), c.a);
}`;
