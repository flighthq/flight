import { computeBoxBlurPassRadius } from '@flighthq/filters';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import type { WebGPUFilterPipeline } from './filterPass';
import { createWebGPUFilterPipeline, drawWebGPUFilterPass } from './filterPass';
import { applyWebGPUBlitPass } from './tintShader';

// Uniforms layout (shared by box and Gaussian):
//   offset  0: texelSize (vec2f)
//   offset  8: direction (vec2f)
//   offset 16: radius (f32)
//   offset 20: sigma (f32)  [Gaussian only; unused for box]
//   offset 24-31: padding
const BOX_BLUR_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  radius : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  var sum = vec4f(0.0);
  let count = f32(2 * r + 1);
  for (var i = -r; i <= r; i++) {
    sum += textureSampleLevel(tex, smp, uv + f32(i) * uni.texelSize * uni.direction, 0.0);
  }
  return sum / count;
}`;

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

const boxBlurPipelines = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();
const gaussianBlurPipelines = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();

function getBoxBlurPipeline(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = boxBlurPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, BOX_BLUR_WGSL, 'replace');
    boxBlurPipelines.set(state, p);
  }
  return p;
}

function getGaussianBlurPipeline(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = gaussianBlurPipelines.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, GAUSSIAN_BLUR_WGSL, 'replace');
    gaussianBlurPipelines.set(state, p);
  }
  return p;
}

function applyBoxBlurPass(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  const pipeline = getBoxBlurPipeline(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    f32[2] = dirX;
    f32[3] = dirY;
    f32[4] = radius;
  });
}

function applyGaussianBlurPass(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  sigma: number,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  const pipeline = getGaussianBlurPipeline(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    f32[2] = dirX;
    f32[3] = dirY;
    f32[4] = radius;
    f32[5] = sigma;
  });
}

/**
 * Applies a separable box blur to `source`, writing to `dest`. `blurX`/`blurY` are
 * the target Gaussian standard deviations; `passes` is the number of box passes per
 * axis (more passes converge on a Gaussian — see `computeBoxBlurPassRadius`). A box
 * blur is cheap and right for soft spreads; for faithful Gaussian use
 * `applyGaussianBlurFilterToWebGPU`. `temp` is a caller-provided ping-pong scratch
 * target distinct from both `source` and `dest`.
 */
export function applyBoxBlurFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  temp: WebGPURenderTarget,
  options: Readonly<{ blurX?: number; blurY?: number; passes?: number }>,
): void {
  const passes = Math.max(1, Math.round(options.passes ?? 1));
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;

  let read: WebGPURenderTarget = source;
  let write: WebGPURenderTarget = temp;

  for (let pass = 0; pass < passes; pass++) {
    const radiusX = computeBoxBlurPassRadius(blurX, passes, pass);
    if (radiusX > 0) {
      applyBoxBlurPass(state, read, write, radiusX, 1, 0);
      read = write;
      write = write === temp ? dest : temp;
    }
    const radiusY = computeBoxBlurPassRadius(blurY, passes, pass);
    if (radiusY > 0) {
      applyBoxBlurPass(state, read, write, radiusY, 0, 1);
      read = write;
      write = write === temp ? dest : temp;
    }
  }

  if (read !== dest) {
    applyWebGPUBlitPass(state, read, dest);
  }
}

/**
 * Applies a faithful separable Gaussian blur to `source`, writing to `dest`.
 * `blurX`/`blurY` are Gaussian standard deviations (CSS `blur(Xpx)` uses sigma = X),
 * matching the CSS and surface Gaussian paths. Each axis is a single weighted pass
 * with radius ⌈3σ⌉. `temp` is a ping-pong scratch target distinct from both
 * `source` and `dest`.
 */
export function applyGaussianBlurFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  temp: WebGPURenderTarget,
  options: Readonly<{ blurX?: number; blurY?: number }>,
): void {
  const sigmaX = options.blurX ?? 4;
  const sigmaY = options.blurY ?? 4;
  const radiusX = sigmaX > 0 ? Math.ceil(sigmaX * 3) : 0;
  const radiusY = sigmaY > 0 ? Math.ceil(sigmaY * 3) : 0;

  if (radiusX === 0 && radiusY === 0) {
    applyWebGPUBlitPass(state, source, dest);
    return;
  }

  let read: WebGPURenderTarget = source;
  let write: WebGPURenderTarget = temp;

  if (radiusX > 0) {
    applyGaussianBlurPass(state, read, write, sigmaX, radiusX, 1, 0);
    read = write;
    write = write === temp ? dest : temp;
  }
  if (radiusY > 0) {
    applyGaussianBlurPass(state, read, write, sigmaY, radiusY, 0, 1);
    read = write;
    write = write === temp ? dest : temp;
  }

  if (read !== dest) {
    applyWebGPUBlitPass(state, read, dest);
  }
}
