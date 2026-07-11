import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu';
import type { BlurEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Plain separable Gaussian blur: two axis passes (source → temp horizontally, temp → dest vertically),
// each a single weighted fullscreen pass with radius ⌈3σ⌉. `blurX`/`blurY` are the Gaussian standard
// deviations (CSS `blur(Xpx)` uses sigma = X), matching the CSS and surface Gaussian references and the
// effects-gl blur. The effects-owned blur primitive — the shared gaussian pass BloomEffect and the plain
// BlurEffect both use, so the wgpu effects backend owns its blur rather than delegating to the filters layer.

// Applies a `BlurEffect` descriptor to `source`, writing to `dest`. `temp` is a ping-pong scratch
// target distinct from both `source` and `dest`.
export function applyBlurEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  temp: Readonly<WgpuRenderTarget>,
  effect: Readonly<BlurEffect>,
): void {
  applyGaussianBlurToWgpu(state, source, dest, temp, { blurX: effect.blurX, blurY: effect.blurY });
}

// Applies a faithful separable Gaussian blur to `source`, writing to `dest`. `blurX`/`blurY` are the
// Gaussian standard deviations in pixels (default 4). Runs two unconditional separable passes,
// source → temp (X) then temp → dest (Y); a zero-radius axis copies through unchanged, so the result
// always lands in `dest` without a separate blit. `temp` is a ping-pong scratch distinct from both.
export function applyGaussianBlurToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  temp: Readonly<WgpuRenderTarget>,
  options: Readonly<{ blurX?: number; blurY?: number }>,
): void {
  const sigmaX = options.blurX ?? 4;
  const sigmaY = options.blurY ?? 4;
  const radiusX = sigmaX > 0 ? Math.ceil(sigmaX * 3) : 0;
  const radiusY = sigmaY > 0 ? Math.ceil(sigmaY * 3) : 0;
  applyWgpuGaussianBlurPass(state, source, temp, sigmaX, radiusX, 1, 0);
  applyWgpuGaussianBlurPass(state, temp, dest, sigmaY, radiusY, 0, 1);
}

export const defaultWgpuBlurEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  const descriptor = { width: ctx.source.width, height: ctx.source.height, format: ctx.source.format };
  const temp = acquireWgpuRenderTarget(ctx.state, ctx.pool, descriptor);
  applyBlurEffectToWgpu(ctx.state, ctx.source, ctx.dest, temp, effect as BlurEffect);
  releaseWgpuRenderTarget(ctx.pool, temp);
};

function applyWgpuGaussianBlurPass(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  sigma: number,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  const pipeline = getWgpuEffectPipeline(state, 'blur.gaussian', GAUSSIAN_BLUR_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    f32[2] = dirX;
    f32[3] = dirY;
    f32[4] = radius;
    f32[5] = sigma;
  });
}

// Slot layout: [0,1]=texelSize, [2,3]=direction, [4]=radius, [5]=sigma.
const GAUSSIAN_BLUR_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  radius : f32,
  sigma : f32,
  _pad0 : f32, _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let twoSigmaSq = 2.0 * uni.sigma * uni.sigma;
  var sum = vec4f(0.0);
  var weightSum = 0.0;
  for (var i = -r; i <= r; i++) {
    let w = exp(-f32(i * i) / twoSigmaSq);
    sum += w * textureSampleLevel(tex, smp, uv + f32(i) * uni.texelSize * uni.direction, 0.0);
    weightSum += w;
  }
  return sum / weightSum;
}`;
