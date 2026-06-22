import type { DisplacementMapFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuDualSourcePipeline } from './filterPass';
import { createWgpuDualSourcePipeline, drawWgpuDualSourcePass } from './filterPass';

// Samples the map (group 2) to compute per-pixel UV displacement, then samples
// the source (group 1) at the displaced coordinate. Map value 0.5 (128/255) is neutral.
//
// Note: scaleY is negated versus the Gl implementation because Wgpu UV y=0
// is the top of the texture (matches screen Y-down), while Gl UV y=0 is the bottom.
//
// Uniforms layout (48 bytes):
//   offset  0: texelSize (vec2f)
//   offset  8: scaleX (f32)
//   offset 12: scaleY (f32)
//   offset 16: componentX (i32)
//   offset 20: componentY (i32)
//   offset 24: mode (i32)
//   offset 28: _pad (i32)
//   offset 32: edgeColor (vec4f)
const DISPLACEMENT_MAP_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  scaleX : f32,
  scaleY : f32,
  componentX : i32,
  componentY : i32,
  mode : i32,
  _pad : i32,
  edgeColor : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texSrc : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texMap : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

fn getChannel(color : vec4f, comp : i32) -> f32 {
  if (comp == 0) { return color.r; }
  if (comp == 1) { return color.g; }
  if (comp == 2) { return color.b; }
  return color.a;
}

fn sampleSource(uv : vec2f) -> vec4f {
  if (uni.mode == 0) { return textureSampleLevel(texSrc, smp, fract(uv), 0.0); }
  if (uni.mode == 1) { return textureSampleLevel(texSrc, smp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0); }
  if (uni.mode == 2) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
    return textureSampleLevel(texSrc, smp, uv, 0.0);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return uni.edgeColor; }
  return textureSampleLevel(texSrc, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let mapSample = textureSampleLevel(texMap, smp2, uv, 0.0);
  let mx = getChannel(mapSample, uni.componentX);
  let my = getChannel(mapSample, uni.componentY);
  let offset = vec2f((mx - 0.5) * uni.scaleX, (my - 0.5) * uni.scaleY) * uni.texelSize;
  return sampleSource(uv + offset);
}`;

const MODE_MAP: Record<string, number> = { wrap: 0, clamp: 1, ignore: 2, color: 3 };

const shaders = new WeakMap<WgpuRenderState, WgpuDualSourcePipeline>();

function getPipeline(state: WgpuRenderState): WgpuDualSourcePipeline {
  let p = shaders.get(state);
  if (p === undefined) {
    p = createWgpuDualSourcePipeline(state, DISPLACEMENT_MAP_WGSL, 'replace');
    shaders.set(state, p);
  }
  return p;
}

/**
 * Applies a displacement map warp to `source`, writing to `dest`. `map` supplies
 * the per-pixel displacement vectors; channels are selected by `filter.componentX`
 * and `filter.componentY` (0=R, 1=G, 2=B, 3=A). A single GPU pass — no scratch
 * targets needed.
 *
 * Note: the Y displacement is internally negated versus the Gl implementation
 * to account for Wgpu's top-left UV origin.
 */
export function applyDisplacementMapFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  map: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  filter: Readonly<Omit<DisplacementMapFilter, 'type'>>,
): void {
  const mode = MODE_MAP[filter.mode ?? 'wrap'] ?? 0;
  const edgeColor = filter.color ?? 0;
  const edgeAlpha = filter.alpha ?? 0;

  const pipeline = getPipeline(state);
  drawWgpuDualSourcePass(state, source, map, dest, pipeline, (f32, i32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    f32[2] = filter.scaleX ?? 0;
    // Negate Y scale: Wgpu UV y=0 is top (Y-down matches screen), Gl UV y=0 is bottom.
    f32[3] = -(filter.scaleY ?? 0);
    i32[4] = filter.componentX ?? 0;
    i32[5] = filter.componentY ?? 1;
    i32[6] = mode;
    // i32[7] = padding
    f32[8] = ((edgeColor >> 16) & 0xff) / 255;
    f32[9] = ((edgeColor >> 8) & 0xff) / 255;
    f32[10] = (edgeColor & 0xff) / 255;
    f32[11] = edgeAlpha;
  });
}
