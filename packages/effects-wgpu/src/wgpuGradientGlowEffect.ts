import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  GradientGlowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';

import { applyWgpuEffectBlitPass, applyWgpuEffectErasePass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { getWgpuEffectGradientRampTexture } from './wgpuEffectGradientRamp';
import type { WgpuEffectPipeline } from './wgpuEffectPass';
import { clearWgpuEffectTarget, EFFECT_VERTEX_WGSL, getWgpuEffectPassState } from './wgpuEffectPass';
import { applyWgpuEffectTintPass } from './wgpuEffectTintShader';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha, then sourceMode decides source compositing.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (neutral tint → box blur → gradient lookup → composite), then releases them.
export function applyGradientGlowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<GradientGlowEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);

  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const strength = effect.strength ?? 1;
  const sourceMode = effect.sourceMode ?? 'draw';

  const { device } = state;
  const fs = getWgpuEffectPassState(state);

  applyWgpuEffectTintPass(state, src, s0, 0xffffff, 1, Math.min(1, strength));
  applyWgpuEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 6,
    blurY: effect.blurY ?? 6,
    passes: quality,
  });

  const rampTexture = getWgpuEffectGradientRampTexture(state, effect.colors, effect.alphas, effect.ratios);
  const rampBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: rampTexture.createView() },
      { binding: 1, resource: fs.sampler },
    ],
  });
  const blurredBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: s1.view },
      { binding: 1, resource: fs.sampler },
    ],
  });

  const pipeline = getLookupPipeline(state);
  const slotOffset = fs.acquireSlot();
  fs.writeSlot(slotOffset, () => {});

  const pass = fs.beginPass(s0, 'load');
  pass.setPipeline(pipeline.pipeline);
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, blurredBG);
  pass.setBindGroup(2, rampBG);
  pass.draw(6);
  pass.end();

  clearWgpuEffectTarget(state, dst);
  applyWgpuEffectBlitPass(state, s0, dst);
  if (sourceMode === 'knockout') {
    applyWgpuEffectErasePass(state, src, dst);
  } else if (sourceMode === 'draw') {
    applyWgpuEffectBlitPass(state, src, dst);
  }

  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuGradientGlowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyGradientGlowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as GradientGlowEffect);
};

// Uses the blurred alpha (group 1) to index into a gradient ramp texture (group 2).
const GRADIENT_LOOKUP_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texBlurred : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texRamp : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let alpha = textureSampleLevel(texBlurred, smp, uv, 0.0).a;
  return textureSampleLevel(texRamp, smp2, vec2f(alpha, 0.5), 0.0);
}`;

function getLookupPipeline(state: WgpuRenderState): WgpuEffectPipeline {
  let p = lookupPipelines.get(state);
  if (p === undefined) {
    const fs = getWgpuEffectPassState(state);
    const { device, format } = state;
    const shaderModule = device.createShaderModule({ code: EFFECT_VERTEX_WGSL + GRADIENT_LOOKUP_FRAGMENT_WGSL });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout, fs.textureBGLayout],
    });
    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    p = { pipeline, blendMode: 'premul' };
    lookupPipelines.set(state, p);
  }
  return p;
}

const lookupPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
