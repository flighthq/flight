import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  GradientBevelEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types';
import type { WgpuEffectPipeline } from '@flighthq/types';

import { applyWgpuEffectBlitPass, applyWgpuEffectErasePass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { getWgpuEffectGradientRampTexture } from './wgpuEffectGradientRamp';
import { clearWgpuEffectTarget, EFFECT_VERTEX_WGSL, getWgpuEffectPassState } from './wgpuEffectPass';
import { applyWgpuEffectTintPass } from './wgpuEffectTintShader';

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth, then sourceMode decides source compositing.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (neutral tint → box blur → bevel encode → gradient lookup + clip → composite), then releases them.
//
// Note: The Y bevel offset is negated versus the Gl implementation to
// account for Wgpu's top-left UV origin.
export function applyGradientBevelEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<GradientBevelEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const strength = effect.strength ?? 1;
  const sourceMode = effect.sourceMode ?? 'draw';

  const { device } = state;
  const fs = getWgpuEffectPassState(state);

  // Build blur basis → s1
  applyWgpuEffectTintPass(state, src, s0, 0xffffff, 1, Math.min(1, strength));
  applyWgpuEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    passes: quality,
  });

  // Encode bevel value from blurred alpha offset samples → s0
  const dx = (Math.cos(angle) * distance) / s1.width;
  // Negate Y: Wgpu UV y=0 is top (Y-down matches screen), Gl UV y=0 is bottom.
  const dy = -((Math.sin(angle) * distance) / s1.height);

  const encodePipeline = getEncodePipeline(state);
  const encodeSlot = fs.acquireSlot();
  fs.writeSlot(encodeSlot, (f32) => {
    f32[0] = dx;
    f32[1] = dy;
  });

  const blurredBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: s1.view },
      { binding: 1, resource: fs.sampler },
    ],
  });

  const encodePass = fs.beginPass(s0, 'load');
  encodePass.setPipeline(encodePipeline.pipeline);
  encodePass.setBindGroup(0, fs.uniformBG, [encodeSlot]);
  encodePass.setBindGroup(1, blurredBG);
  encodePass.draw(6);
  encodePass.end();

  // Apply: look up gradient ramp from encoded bevel, clip to source alpha → s1
  const rampTexture = getWgpuEffectGradientRampTexture(state, effect.colors, effect.alphas, effect.ratios);
  const rampBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: rampTexture.createView() },
      { binding: 1, resource: fs.sampler },
    ],
  });
  const encodedBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: s0.view },
      { binding: 1, resource: fs.sampler },
    ],
  });
  const sourceBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: src.view },
      { binding: 1, resource: fs.sampler },
    ],
  });

  const applyPipeline = getApplyPipeline(state);
  const applySlot = fs.acquireSlot();
  fs.writeSlot(applySlot, () => {});

  const applyPass = fs.beginPass(s1, 'load');
  applyPass.setPipeline(applyPipeline.pipeline);
  applyPass.setBindGroup(0, fs.uniformBG, [applySlot]);
  applyPass.setBindGroup(1, encodedBG);
  applyPass.setBindGroup(2, rampBG);
  applyPass.setBindGroup(3, sourceBG);
  applyPass.draw(6);
  applyPass.end();

  clearWgpuEffectTarget(state, dst);
  if (sourceMode === 'draw') applyWgpuEffectBlitPass(state, src, dst);
  applyWgpuEffectBlitPass(state, s1, dst);
  if (sourceMode === 'knockout') applyWgpuEffectErasePass(state, src, dst);

  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuGradientBevelEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyGradientBevelEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as GradientBevelEffect);
};

// Samples the blurred alpha at +offset and -offset to compute a bevel value
// in [-1, 1], mapped to [0, 1] for gradient lookup. Outputs the encoded value
// in the red channel; alpha=1 (will be clipped later).
//
// Note: The Y offset component is negated versus the Gl implementation so
// that the bevel direction matches across backends (Wgpu UV y=0 is top-left).
//
// Uniforms layout (16 bytes):
//   offset 0: offset (vec2f)
//   offset 8: _pad (vec2f)
const BEVEL_ENCODE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  offset : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let high = textureSampleLevel(tex, smp, uv - uni.offset, 0.0).a;
  let low  = textureSampleLevel(tex, smp, uv + uni.offset, 0.0).a;
  let bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  return vec4f(bevelVal, 0.0, 0.0, 1.0);
}`;

// Looks up the encoded bevel value (in .r) in the gradient ramp (group 2)
// and clips the result to the source alpha (group 3).
const BEVEL_APPLY_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texEncoded : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texRamp : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;
@group(3) @binding(0) var texSource : texture_2d<f32>;
@group(3) @binding(1) var smp3 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let bevelVal = textureSampleLevel(texEncoded, smp, uv, 0.0).r;
  let color = textureSampleLevel(texRamp, smp2, vec2f(bevelVal, 0.5), 0.0);
  let srcAlpha = textureSampleLevel(texSource, smp3, uv, 0.0).a;
  return color * srcAlpha;
}`;

function getApplyPipeline(state: WgpuRenderState): WgpuEffectPipeline {
  let p = applyPipelines.get(state);
  if (p === undefined) {
    const fs = getWgpuEffectPassState(state);
    const { device, format } = state;
    const shaderModule = device.createShaderModule({ code: EFFECT_VERTEX_WGSL + BEVEL_APPLY_FRAGMENT_WGSL });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout, fs.textureBGLayout, fs.textureBGLayout],
    });
    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    p = { pipeline, blendMode: 'premul' };
    applyPipelines.set(state, p);
  }
  return p;
}

function getEncodePipeline(state: WgpuRenderState): WgpuEffectPipeline {
  let p = encodePipelines.get(state);
  if (p === undefined) {
    const fs = getWgpuEffectPassState(state);
    const { device, format } = state;
    const shaderModule = device.createShaderModule({ code: EFFECT_VERTEX_WGSL + BEVEL_ENCODE_FRAGMENT_WGSL });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout],
    });
    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    p = { pipeline, blendMode: 'replace' };
    encodePipelines.set(state, p);
  }
  return p;
}

const encodePipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
const applyPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
