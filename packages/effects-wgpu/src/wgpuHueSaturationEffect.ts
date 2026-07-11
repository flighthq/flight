import type { HueSaturationEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Hue/saturation/lightness: convert to HSL, adjust, convert back.
export function applyHueSaturationEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<HueSaturationEffect>,
): void {
  const hue = (effect.hue ?? 0) / 360;
  const saturation = effect.saturation ?? 1;
  const lightness = effect.lightness ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.hueSaturation', HUE_SATURATION_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = hue;
    f32[1] = saturation;
    f32[2] = lightness;
  });
}

export const defaultWgpuHueSaturationEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyHueSaturationEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as HueSaturationEffect);
};

// Slot layout: [0]=hue (turns), [1]=saturation, [2]=lightness.
const HUE_SATURATION_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_hue : f32, u_saturation : f32, u_lightness : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn rgb2hsl(c : vec3f) -> vec3f {
  let mx = max(c.r, max(c.g, c.b));
  let mn = min(c.r, min(c.g, c.b));
  let l = (mx + mn) * 0.5;
  var h = 0.0;
  var s = 0.0;
  let d = mx - mn;
  if (d > 0.0001) {
    s = select(d / (2.0 - mx - mn), d / (mx + mn), l < 0.5);
    if (mx == c.r) {
      h = (c.g - c.b) / d + select(0.0, 6.0, c.g < c.b);
    } else if (mx == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3f(h, s, l);
}

fn hue2rgb(p : f32, q : f32, t_in : f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 1.0 / 2.0) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl2rgb(hsl : vec3f) -> vec3f {
  let h = hsl.x;
  let s = hsl.y;
  let l = hsl.z;
  if (s <= 0.0) { return vec3f(l); }
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3f(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + uni.u_hue);
  hsl.y = clamp(hsl.y * uni.u_saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + uni.u_lightness, 0.0, 1.0);
  return vec4f(hsl2rgb(hsl), c.a);
}`;
