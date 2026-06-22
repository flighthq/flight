import type { GradientGlowFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { applyWgpuBlitPass } from './wgpuBlitShader';
import { applyBoxBlurFilterToWgpu } from './wgpuBlurFilter';
import type { WgpuFilterPipeline } from './wgpuFilterPass';
import { clearWgpuFilterTarget, FILTER_VERTEX_WGSL, getWgpuFilterState } from './wgpuFilterPass';
import { createWgpuGradientRampTexture } from './wgpuGradientRamp';
import { applyWgpuTintPass } from './wgpuTintShader';

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

const lookupPipelines = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();

function getLookupPipeline(state: WgpuRenderState): WgpuFilterPipeline {
  let p = lookupPipelines.get(state);
  if (p === undefined) {
    const fs = getWgpuFilterState(state);
    const { device, format } = state;
    const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + GRADIENT_LOOKUP_FRAGMENT_WGSL });
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

/**
 * Applies a gradient glow to `source`, writing the result to `dest`.
 * The gradient ramp is built each call from `filter.colors`, `filter.alphas`,
 * and `filter.ratios`. Compositing order: gradient glow → source on top.
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates a temporary `GPUTexture` internally on each call.
 */
export function applyGradientGlowFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  scratch: WgpuRenderTarget[],
  filter: Readonly<Omit<GradientGlowFilter, 'kind'>>,
): void {
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const strength = filter.strength ?? 1;

  const [s0, s1, s2] = scratch;
  const { device } = state;
  const fs = getWgpuFilterState(state);

  applyWgpuTintPass(state, source, s0, 0xffffff, 1, Math.min(1, strength));
  applyBoxBlurFilterToWgpu(state, s0, s1, s2, {
    blurX: filter.blurX ?? 6,
    blurY: filter.blurY ?? 6,
    passes: quality,
  });

  const rampTexture = createWgpuGradientRampTexture(state, filter.colors, filter.alphas, filter.ratios);
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

  rampTexture.destroy();

  clearWgpuFilterTarget(state, dest);
  applyWgpuBlitPass(state, s0, dest);
  applyWgpuBlitPass(state, source, dest);
}
