import type { BevelFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { applyWgpuBlitPass } from './wgpuBlitShader';
import { applyBoxBlurFilterToWgpu } from './wgpuBlurFilter';
import type { WgpuDualSourcePipeline } from './wgpuFilterPass';
import { clearWgpuFilterTarget, createWgpuDualSourcePipeline, drawWgpuDualSourcePass } from './wgpuFilterPass';
import { applyWgpuTintPass } from './wgpuTintShader';

/**
 * Applies a bevel filter to `source`, writing the result to `dest`.
 *
 * The bevel is the directional gradient of the source's blurred alpha:
 * `gradient = m(p − L) − m(p + L)` where `m` is the blurred alpha and
 * `L = (cos angle, sin angle) · distance`. A positive gradient (the edge facing
 * the light) draws the highlight color; a negative gradient draws the shadow
 * color; `|gradient| · strength` is the band's alpha. The resulting tinted mask
 * is composited over the source — matching `bevelSurface` (the CPU reference).
 *
 * `bevelType` clips the mask:
 *   - `'inner'` (default for this filter): keep the band inside the shape (× source alpha)
 *   - `'outer'`: keep it outside the shape (× 1 − source alpha)
 *   - `'full'`: no clip
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`
 * (white-tinted alpha, blurred field, and the blur's ping-pong temp). The filter
 * allocates nothing itself.
 */
export function applyBevelFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  scratch: WgpuRenderTarget[],
  filter: Readonly<Omit<BevelFilter, 'kind'>>,
): void {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  // Match the surface reference, which snaps the light offset to whole pixels.
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const shadowColor = filter.shadowColor ?? 0x000000;
  const shadowAlpha = filter.shadowAlpha ?? 1;
  const highlightColor = filter.highlightColor ?? 0xffffff;
  const highlightAlpha = filter.highlightAlpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const knockout = filter.knockout ?? false;
  const bevelType = filter.bevelType ?? 'inner';

  const [tinted, blurred, blurTemp] = scratch;

  // Blurred alpha field (neutral white tint, strength 1 — strength is the gradient
  // intensity applied per-pixel in the composite, not baked into the field).
  applyWgpuTintPass(state, source, tinted, 0xffffff, 1, 1);
  applyBoxBlurFilterToWgpu(state, tinted, blurred, blurTemp, {
    blurX: filter.blurX ?? 4,
    blurY: filter.blurY ?? 4,
    passes: quality,
  });

  clearWgpuFilterTarget(state, dest);
  if (!knockout) applyWgpuBlitPass(state, source, dest);

  applyWgpuBevelCompositePass(state, blurred, source, dest, {
    offsetX: offsetX / source.width,
    // Negate Y: the field is a top-down render-target texture, so sampling toward the light
    // along screen-Y reads the opposite UV-Y (same orientation rule as applyWgpuBlitOffsetPass).
    offsetY: -offsetY / source.height,
    highlightColor,
    highlightAlpha,
    shadowColor,
    shadowAlpha,
    intensity: strength,
    clipMode: bevelType === 'inner' ? 1 : bevelType === 'outer' ? 2 : 0,
  });
}

// Reads the blurred alpha field (group 1) and source (group 2); writes the tinted, clipped bevel
// mask, premultiplied, blended over `dest` (which already holds the source unless knockout).
const BEVEL_COMPOSITE_WGSL = /* wgsl */ `
struct Uniforms {
  highlight : vec4f,
  shadow : vec4f,
  offset : vec2f,
  intensity : f32,
  clipMode : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var fieldTex : texture_2d<f32>;
@group(1) @binding(1) var fieldSmp : sampler;
@group(2) @binding(0) var srcTex : texture_2d<f32>;
@group(2) @binding(1) var srcSmp : sampler;

fn sampleField(uv : vec2f) -> f32 {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 0.0; }
  return textureSampleLevel(fieldTex, fieldSmp, uv, 0.0).a;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let lit = sampleField(uv - uni.offset);
  let shade = sampleField(uv + uni.offset);
  let gradient = lit - shade;
  let srcA = textureSampleLevel(srcTex, srcSmp, uv, 0.0).a;
  let isHighlight = gradient >= 0.0;
  let color = select(uni.shadow.xyz, uni.highlight.xyz, isHighlight);
  let colorAlpha = select(uni.shadow.w, uni.highlight.w, isHighlight);
  var clip = 1.0;
  if (uni.clipMode == 1.0) { clip = srcA; }
  else if (uni.clipMode == 2.0) { clip = 1.0 - srcA; }
  let edge = min(1.0, abs(gradient) * uni.intensity);
  let a = edge * colorAlpha * clip;
  return vec4f(color * a, a);
}`;

const bevelCompositePipelines = new WeakMap<WgpuRenderState, WgpuDualSourcePipeline>();

type BevelCompositeParams = Readonly<{
  offsetX: number;
  offsetY: number;
  highlightColor: number;
  highlightAlpha: number;
  shadowColor: number;
  shadowAlpha: number;
  intensity: number;
  clipMode: number;
}>;

function applyWgpuBevelCompositePass(
  state: WgpuRenderState,
  field: WgpuRenderTarget,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  params: BevelCompositeParams,
): void {
  const pipeline = getWgpuBevelCompositeShader(state);
  drawWgpuDualSourcePass(state, field, source, dest, pipeline, (f32) => {
    f32[0] = ((params.highlightColor >> 16) & 0xff) / 255;
    f32[1] = ((params.highlightColor >> 8) & 0xff) / 255;
    f32[2] = (params.highlightColor & 0xff) / 255;
    f32[3] = params.highlightAlpha;
    f32[4] = ((params.shadowColor >> 16) & 0xff) / 255;
    f32[5] = ((params.shadowColor >> 8) & 0xff) / 255;
    f32[6] = (params.shadowColor & 0xff) / 255;
    f32[7] = params.shadowAlpha;
    f32[8] = params.offsetX;
    f32[9] = params.offsetY;
    f32[10] = params.intensity;
    f32[11] = params.clipMode;
  });
}

function getWgpuBevelCompositeShader(state: WgpuRenderState): WgpuDualSourcePipeline {
  let p = bevelCompositePipelines.get(state);
  if (p === undefined) {
    p = createWgpuDualSourcePipeline(state, BEVEL_COMPOSITE_WGSL);
    bevelCompositePipelines.set(state, p);
  }
  return p;
}
