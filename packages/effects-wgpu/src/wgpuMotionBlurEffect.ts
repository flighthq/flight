import type { MotionBlurEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';
import type { WgpuDualSourceEffectPipeline } from '@flighthq/types';

import { createWgpuDualSourceEffectPipeline, drawWgpuDualSourceEffectPass } from './wgpuEffectPass';

// Motion blur (per-object): the velocity-driven analog of the depth consumers (fog/DoF), the Wgpu
// mirror of effects-gl's applyMotionBlurEffectToGl. When the scene produced a per-pixel velocity
// buffer (`velocityTexture`, rgba16f screen-space velocity in pixels in the RG channels), this is the
// real recipe — read each fragment's velocity, scale it by `intensity`, and accumulate `samples` taps
// spread along that vector centered on the fragment, smearing every object by its own motion. The
// velocity texture binds as the second source via drawWgpuDualSourceEffectPass (@group(2)). When velocity is
// absent (the scene did not write the buffer), u_hasVelocity=0 and it is a passthrough copy (sentinel
// path), preserving the pipeline stage without altering the image. Demonstrates the
// ctx.sceneVelocityTexture seam: real velocity path when present, sentinel copy when null.
export function applyMotionBlurEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  velocityTexture: GPUTexture | null,
  effect: Readonly<MotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const samples = effect.samples ?? 16;
  const pipeline = getMotionBlurPipeline(state);
  if (velocityTexture === null) {
    // Sentinel path: no velocity buffer — bind source as both inputs so the dual-source layout is
    // satisfied, and u_hasVelocity=0 makes the fragment a passthrough copy.
    drawWgpuDualSourceEffectPass(
      state,
      source as WgpuRenderTarget,
      source as WgpuRenderTarget,
      dest as WgpuRenderTarget,
      pipeline,
      (f32) => {
        f32[0] = intensity;
        f32[1] = samples;
        f32[2] = source.width;
        f32[3] = source.height;
        f32[4] = 0;
      },
    );
    return;
  }
  // Wrap the raw velocity GPUTexture as a minimal second source: drawWgpuDualSourceEffectPass reads only the
  // `.view`, so a view over the velocity texture is all that is required for the @group(2) binding.
  const velocitySource = { view: velocityTexture.createView() } as WgpuRenderTarget;
  drawWgpuDualSourceEffectPass(
    state,
    source as WgpuRenderTarget,
    velocitySource,
    dest as WgpuRenderTarget,
    pipeline,
    (f32) => {
      f32[0] = intensity;
      f32[1] = samples;
      f32[2] = source.width;
      f32[3] = source.height;
      f32[4] = 1;
    },
  );
}

export const defaultWgpuMotionBlurEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyMotionBlurEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.sceneVelocityTexture, effect as MotionBlurEffect);
};

// Motion blur needs two source bindings (color = group 1, velocity = group 2), so it uses the
// dual-source filter primitive; cached per state alongside the single-source effect pipelines.
function getMotionBlurPipeline(state: WgpuRenderState): WgpuDualSourceEffectPipeline {
  let pipeline = _motionBlurPipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWgpuDualSourceEffectPipeline(state, MOTION_BLUR_FRAGMENT_WGSL, 'replace');
    _motionBlurPipelines.set(state, pipeline);
  }
  return pipeline;
}

const _motionBlurPipelines = new WeakMap<WgpuRenderState, WgpuDualSourceEffectPipeline>();

// Slot layout: [0]=intensity, [1]=samples, [2]=resolution.x, [3]=resolution.y, [4]=hasVelocity. Color
// binds at group 1, velocity at group 2. u_resolution converts the pixel-space velocity into UV offsets.
const MOTION_BLUR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_samples : f32,
  u_resolution : vec2f,
  u_hasVelocity : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex0 : texture_2d<f32>;
@group(1) @binding(1) var smp0 : sampler;
@group(2) @binding(0) var tex1 : texture_2d<f32>;
@group(2) @binding(1) var smp1 : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(tex0, smp0, uv, 0.0);
  if (uni.u_hasVelocity < 0.5) {
    // Sentinel path: no velocity buffer written — passthrough copy.
    return base;
  }
  // Velocity decode: rgba16f buffer stores screen-space velocity in pixels in the RG channels. Convert
  // to a UV-space smear vector via u_resolution and scale by intensity.
  let velocityPixels = textureSampleLevel(tex1, smp1, uv, 0.0).rg;
  let smear = (velocityPixels / uni.u_resolution) * uni.u_intensity;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    // Center the taps on the fragment: t in [-0.5, 0.5] spreads the accumulation along the motion vector.
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + smear * t;
    sum = sum + textureSampleLevel(tex0, smp0, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}`;
