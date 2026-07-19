import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  BevelEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

import { applyWgpuEffectBlitPass, applyWgpuEffectErasePass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import type { WgpuDualSourceEffectPipeline } from './wgpuEffectPass';
import {
  clearWgpuEffectTarget,
  createWgpuDualSourceEffectPipeline,
  drawWgpuDualSourceEffectPass,
} from './wgpuEffectPass';
import { applyWgpuEffectTintPass } from './wgpuEffectTintShader';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType, then sourceMode decides source compositing.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (neutral tint → box blur → directional-gradient composite), then releases them.
export function applyBevelEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<BevelEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const tinted = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurred = acquireWgpuRenderTarget(state, pool, descriptor);
  const blurTemp = acquireWgpuRenderTarget(state, pool, descriptor);

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  // Match the surface reference, which snaps the light offset to whole pixels.
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const shadowColor = effect.shadowColor ?? 0x000000;
  const shadowAlpha = effect.shadowAlpha ?? 1;
  const highlightColor = effect.highlightColor ?? 0xffffff;
  const highlightAlpha = effect.highlightAlpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';
  const bevelType = effect.bevelType ?? 'inner';

  // Blurred alpha field (neutral white tint, strength 1 — strength is the gradient
  // intensity applied per-pixel in the composite, not baked into the field).
  applyWgpuEffectTintPass(state, src, tinted, 0xffffff, 1, 1);
  applyWgpuEffectBoxBlur(state, tinted, blurred, blurTemp, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    passes: quality,
  });

  clearWgpuEffectTarget(state, dst);
  if (sourceMode === 'draw') applyWgpuEffectBlitPass(state, src, dst);

  applyWgpuBevelCompositePass(state, blurred, src, dst, {
    offsetX: offsetX / source.width,
    // Negate Y: the field is a top-down render-target texture, so sampling toward the light
    // along screen-Y reads the opposite UV-Y (same orientation rule as applyWgpuEffectBlitOffsetPass).
    offsetY: -offsetY / source.height,
    highlightColor,
    highlightAlpha,
    shadowColor,
    shadowAlpha,
    intensity: strength,
    clipMode: bevelType === 'inner' ? 1 : bevelType === 'outer' ? 2 : 0,
  });

  if (sourceMode === 'knockout') applyWgpuEffectErasePass(state, src, dst);

  releaseWgpuRenderTarget(pool, tinted);
  releaseWgpuRenderTarget(pool, blurred);
  releaseWgpuRenderTarget(pool, blurTemp);
}

export const defaultWgpuBevelEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyBevelEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as BevelEffect);
};

// Reads the blurred alpha field (group 1) and source (group 2); writes the tinted, clipped bevel
// mask, premultiplied, blended over `dest` (which already holds the source when sourceMode is 'draw').
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
  drawWgpuDualSourceEffectPass(state, field, source, dest, pipeline, (f32) => {
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

function getWgpuBevelCompositeShader(state: WgpuRenderState): WgpuDualSourceEffectPipeline {
  let p = bevelCompositePipelines.get(state);
  if (p === undefined) {
    p = createWgpuDualSourceEffectPipeline(state, BEVEL_COMPOSITE_WGSL);
    bevelCompositePipelines.set(state, p);
  }
  return p;
}

const bevelCompositePipelines = new WeakMap<WgpuRenderState, WgpuDualSourceEffectPipeline>();
