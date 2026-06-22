import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type {
  CameraMotionBlurEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Camera motion blur: a real single-pass radial/zoom blur scaled by intensity — smears each sample
// toward the screen center. A legitimate 2D effect on its own, the Wgpu mirror of effects-gl's
// applyCameraMotionBlurEffectToGl. Two richer variants are 2D-native follow-ups, not 3D-gated:
// feeding the actual camera/root transform delta as the smear vector (global velocity), and per-object
// motion blur reading ctx.sceneVelocityTexture (per-node prev-transform delta).
export function applyCameraMotionBlurEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<CameraMotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 0.5;
  const samples = effect.samples ?? 16;
  const pipeline = getWgpuEffectPipeline(state, 'motion.cameraMotionBlur', CAMERA_MOTION_BLUR_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = samples;
  });
}

export const defaultWgpuCameraMotionBlurEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
};

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
