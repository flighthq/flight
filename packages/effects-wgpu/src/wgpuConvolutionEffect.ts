import type { ConvolutionEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Largest kernel the WebGPU path supports (a 7×7 = 49 elements). The uniform struct packs to 244
// bytes, within the effect-pass 256-byte slot.
export const MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE = 49;

// Generic matrix-kernel convolution: each output pixel is the weighted sum of its matrixX×matrixY
// neighborhood, normalized by `divisor` (defaults to the matrix sum) and offset by `bias`.
export function applyConvolutionEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ConvolutionEffect>,
): void {
  const { matrix, matrixX, matrixY } = effect;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution matrix dimensions must be positive');
  if (matrixX * matrixY > MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE)
    throw new Error(`Convolution kernel exceeds the WebGPU maximum of 7×7 (${matrixX}×${matrixY} given)`);
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution matrix does not match its declared dimensions');

  const bias = effect.bias ?? 0;
  const clampEdge = effect.clamp ?? true;
  const preserveAlpha = effect.preserveAlpha ?? true;
  const edgeColor = effect.color ?? 0;
  const divisor = effect.divisor ?? getAutoDivisor(matrix, matrixX * matrixY);

  const pipeline = getWgpuEffectPipeline(state, 'stylization.convolution', CONVOLUTION_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32, i32) => {
    // texelSize at offset 0 (f32[0], f32[1])
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    // matrixX, matrixY at offset 8, 12 (i32[2], i32[3])
    i32[2] = matrixX;
    i32[3] = matrixY;
    // divisor, bias at offset 16, 20 (f32[4], f32[5])
    f32[4] = divisor;
    f32[5] = bias;
    // clampEdge, preserveAlpha at offset 24, 28 (i32[6], i32[7])
    i32[6] = clampEdge ? 1 : 0;
    i32[7] = preserveAlpha ? 1 : 0;
    // edgeColor at offset 32 (f32[8..11])
    f32[8] = ((edgeColor >> 16) & 0xff) / 255;
    f32[9] = ((edgeColor >> 8) & 0xff) / 255;
    f32[10] = (edgeColor & 0xff) / 255;
    f32[11] = ((edgeColor >>> 24) & 0xff) / 255;
    // matrix at offset 48 (f32[12..60])
    for (let i = 0; i < matrixX * matrixY; i++) f32[12 + i] = matrix[i];
  });
}

export const defaultWgpuConvolutionEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyConvolutionEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ConvolutionEffect);
};

// Sums the kernel weights; returns 1 when the sum is 0 (e.g. an edge-detect kernel) so the divide is safe.
function getAutoDivisor(matrix: ReadonlyArray<number>, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += matrix[i];
  return sum === 0 ? 1 : sum;
}

// Uniforms layout:
//   offset  0: texelSize (vec2f)   offset  8: matrixX (i32)   offset 12: matrixY (i32)
//   offset 16: divisor (f32)       offset 20: bias (f32)      offset 24: clampEdge (i32)
//   offset 28: preserveAlpha (i32) offset 32: edgeColor (vec4f)
//   offset 48: matrix (array<f32, 49>) — 244 bytes total, within the 256-byte slot.
const CONVOLUTION_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  matrixX : i32,
  matrixY : i32,
  divisor : f32,
  bias : f32,
  clampEdge : i32,
  preserveAlpha : i32,
  edgeColor : vec4f,
  matrix : array<f32, ${MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE}>,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sampleAt(uv : vec2f) -> vec4f {
  if (uni.clampEdge != 0) {
    return textureSampleLevel(tex, smp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return uni.edgeColor;
  }
  return textureSampleLevel(tex, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let offsetX = uni.matrixX / 2;
  let offsetY = uni.matrixY / 2;
  var sum = vec4f(0.0);
  for (var ky : i32 = 0; ky < uni.matrixY; ky++) {
    for (var kx : i32 = 0; kx < uni.matrixX; kx++) {
      let weight = uni.matrix[ky * uni.matrixX + kx];
      let off = vec2f(f32(kx - offsetX), f32(ky - offsetY)) * uni.texelSize;
      sum += sampleAt(uv + off) * weight;
    }
  }
  sum = sum / uni.divisor;
  sum += uni.bias / 255.0;
  sum = clamp(sum, vec4f(0.0), vec4f(1.0));
  if (uni.preserveAlpha != 0) {
    let origAlpha = textureSampleLevel(tex, smp, uv, 0.0).a;
    let straightRGB = select(vec3f(0.0), clamp(sum.rgb / sum.a, vec3f(0.0), vec3f(1.0)), sum.a > 0.0);
    sum = vec4f(straightRGB * origAlpha, origAlpha);
  }
  return sum;
}`;
