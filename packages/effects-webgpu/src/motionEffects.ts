import type { WebGPUDualSourcePipeline } from '@flighthq/filters-webgpu';
import { drawWebGPUDualSourcePass, drawWebGPUFilterPass } from '@flighthq/filters-webgpu';
import { createWebGPUDualSourcePipeline } from '@flighthq/filters-webgpu';
import type {
  CameraMotionBlurEffect,
  DirectionalBlurEffect,
  MotionBlurEffect,
  RadialBlurEffect,
  WebGPURenderEffectRunner,
  WebGPURenderState,
  WebGPURenderTarget,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';

// Camera motion blur: a real single-pass radial/zoom blur scaled by intensity — smears each sample
// toward the screen center. A legitimate 2D effect on its own, the WebGPU mirror of effects-webgl's
// applyCameraMotionBlurEffectToWebGL. Two richer variants are 2D-native follow-ups, not 3D-gated:
// feeding the actual camera/root transform delta as the smear vector (global velocity), and per-object
// motion blur reading ctx.sceneVelocityTexture (per-node prev-transform delta).
export function applyCameraMotionBlurEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<CameraMotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 0.5;
  const samples = effect.samples ?? 16;
  const pipeline = getWebGPUEffectPipeline(
    state,
    'motion.cameraMotionBlur',
    CAMERA_MOTION_BLUR_FRAGMENT_WGSL,
    'replace',
  );
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = samples;
  });
}

// Directional blur: accumulate samples stepped along `angle` over `length` texels, normalized by the
// sample count. Single-pass reference recipe, the WebGPU mirror of effects-webgl's
// applyDirectionalBlurEffectToWebGL. u_resolution converts the texel length into UV space.
export function applyDirectionalBlurEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<DirectionalBlurEffect>,
): void {
  const angle = effect.angle ?? 0;
  const length = effect.length ?? 8;
  const samples = effect.samples ?? 16;
  const pipeline = getWebGPUEffectPipeline(state, 'motion.directionalBlur', DIRECTIONAL_BLUR_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = angle;
    f32[1] = length;
    f32[2] = samples;
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

// Motion blur (per-object): the velocity-driven analog of the depth consumers (fog/DoF), the WebGPU
// mirror of effects-webgl's applyMotionBlurEffectToWebGL. When the scene produced a per-pixel velocity
// buffer (`velocityTexture`, rgba16f screen-space velocity in pixels in the RG channels), this is the
// real recipe — read each fragment's velocity, scale it by `intensity`, and accumulate `samples` taps
// spread along that vector centered on the fragment, smearing every object by its own motion. The
// velocity texture binds as the second source via drawWebGPUDualSourcePass (@group(2)). When velocity is
// absent (the scene did not write the buffer), u_hasVelocity=0 and it is a passthrough copy (sentinel
// path), preserving the pipeline stage without altering the image. Demonstrates the
// ctx.sceneVelocityTexture seam: real velocity path when present, sentinel copy when null.
export function applyMotionBlurEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  velocityTexture: GPUTexture | null,
  effect: Readonly<MotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const samples = effect.samples ?? 16;
  const pipeline = getMotionBlurPipeline(state);
  if (velocityTexture === null) {
    // Sentinel path: no velocity buffer — bind source as both inputs so the dual-source layout is
    // satisfied, and u_hasVelocity=0 makes the fragment a passthrough copy.
    drawWebGPUDualSourcePass(
      state,
      source as WebGPURenderTarget,
      source as WebGPURenderTarget,
      dest as WebGPURenderTarget,
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
  // Wrap the raw velocity GPUTexture as a minimal second source: drawWebGPUDualSourcePass reads only the
  // `.view`, so a view over the velocity texture is all that is required for the @group(2) binding.
  const velocitySource = { view: velocityTexture.createView() } as WebGPURenderTarget;
  drawWebGPUDualSourcePass(
    state,
    source as WebGPURenderTarget,
    velocitySource,
    dest as WebGPURenderTarget,
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

// Radial blur: accumulate samples stepped from the current uv toward (centerX, centerY) scaled by
// `strength`, normalized by the sample count. Single-pass reference recipe, the WebGPU mirror of
// effects-webgl's applyRadialBlurEffectToWebGL.
export function applyRadialBlurEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<RadialBlurEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const strength = effect.strength ?? 0.2;
  const samples = effect.samples ?? 16;
  const pipeline = getWebGPUEffectPipeline(state, 'motion.radialBlur', RADIAL_BLUR_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = centerX;
    f32[1] = centerY;
    f32[2] = strength;
    f32[3] = samples;
  });
}

export const defaultWebGPUCameraMotionBlurEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
};

export const defaultWebGPUDirectionalBlurEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};

export const defaultWebGPUMotionBlurEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyMotionBlurEffectToWebGPU(ctx.state, ctx.source, ctx.dest, ctx.sceneVelocityTexture, effect as MotionBlurEffect);
};

export const defaultWebGPURadialBlurEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as RadialBlurEffect);
};

// Motion blur needs two source bindings (color = group 1, velocity = group 2), so it uses the
// dual-source filter primitive; cached per state alongside the single-source effect pipelines.
function getMotionBlurPipeline(state: WebGPURenderState): WebGPUDualSourcePipeline {
  let pipeline = _motionBlurPipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWebGPUDualSourcePipeline(state, MOTION_BLUR_FRAGMENT_WGSL, 'replace');
    _motionBlurPipelines.set(state, pipeline);
  }
  return pipeline;
}

const _motionBlurPipelines = new WeakMap<WebGPURenderState, WebGPUDualSourcePipeline>();

// Slot layout: [0]=intensity, [1]=samples. SAMPLES caps the loop; min(u_samples, 16.0) gates the taps.
const CAMERA_MOTION_BLUR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_samples : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let toCenter = vec2f(0.5) - uv;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, f32(i) / (count - 1.0), count > 1.0);
    let p = uv + toCenter * (t * uni.u_intensity);
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}`;

// Slot layout: [0]=angle, [1]=length, [2]=samples, [3]=pad, [4]=resolution.x, [5]=resolution.y.
const DIRECTIONAL_BLUR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_angle : f32,
  u_length : f32,
  u_samples : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let dir = vec2f(cos(uni.u_angle), sin(uni.u_angle)) * (uni.u_length / uni.u_resolution);
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + dir * t;
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}`;

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

// Slot layout: [0]=center.x, [1]=center.y, [2]=strength, [3]=samples.
const RADIAL_BLUR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_center : vec2f,
  u_strength : f32,
  u_samples : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let toCenter = uni.u_center - uv;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, f32(i) / (count - 1.0), count > 1.0);
    let p = uv + toCenter * (t * uni.u_strength);
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}`;
