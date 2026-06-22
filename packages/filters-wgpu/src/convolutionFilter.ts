import type { ConvolutionFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuFilterPipeline } from './filterPass';
import { createWgpuFilterPipeline, drawWgpuFilterPass } from './filterPass';

// Max supported kernel: 7×7 = 49 elements. Use the surface path for larger kernels.
const MAX_KERNEL = 49;

// Uniforms layout:
//   offset  0: texelSize (vec2f, 8 bytes)
//   offset  8: matrixX (i32, 4 bytes)
//   offset 12: matrixY (i32, 4 bytes)
//   offset 16: divisor (f32)
//   offset 20: bias (f32)
//   offset 24: clampEdge (i32)
//   offset 28: preserveAlpha (i32)
//   offset 32: edgeColor (vec4f, 16 bytes)
//   offset 48: matrix (array<f32, 49> = 196 bytes)
// Total: 244 bytes → struct padded to 256 ✓
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
  matrix : array<f32, ${MAX_KERNEL}>,
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

const shaders = new WeakMap<WgpuRenderState, WgpuFilterPipeline>();

function getPipeline(state: WgpuRenderState): WgpuFilterPipeline {
  let p = shaders.get(state);
  if (p === undefined) {
    p = createWgpuFilterPipeline(state, CONVOLUTION_WGSL, 'replace');
    shaders.set(state, p);
  }
  return p;
}

function getAutoDiv(matrix: ReadonlyArray<number>, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += matrix[i];
  return sum === 0 ? 1 : sum;
}

/**
 * Applies a convolution filter to `source`, writing to `dest`. Kernels larger
 * than 7×7 are not supported; use `applyConvolutionFilterToSurface` for those.
 */
export function applyConvolutionFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  filter: Readonly<Omit<ConvolutionFilter, 'type'>>,
): void {
  const { matrix, matrixX, matrixY } = filter;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution matrix dimensions must be positive');
  if (matrixX * matrixY > MAX_KERNEL)
    throw new Error(`Convolution kernel exceeds the WebGPU maximum of 7×7 (${matrixX}×${matrixY} given)`);
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution matrix does not match its declared dimensions');

  const bias = filter.bias ?? 0;
  const clampEdge = filter.clamp ?? true;
  const preserveAlpha = filter.preserveAlpha ?? true;
  const edgeColor = filter.color ?? 0;
  const divisor = filter.divisor ?? getAutoDiv(matrix, matrixX * matrixY);

  const pipeline = getPipeline(state);
  drawWgpuFilterPass(state, source, dest, pipeline, (f32, i32) => {
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
