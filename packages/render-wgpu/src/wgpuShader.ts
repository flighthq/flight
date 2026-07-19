import type { ColorTransform, RenderProxy, WgpuRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export type { WgpuBitmapShader } from '@flighthq/types';

// ---- WGSL source ----

// Uniform buffer layout (per-draw slot in the ring, 256-byte aligned):
//   offset  0–47 : mat3x3f matrix (3 columns × 16 bytes each due to vec3 padding)
//   offset 48    : f32 alpha
//   offset 52    : u32 hasColorTransform
//   offset 56–63 : 2× f32 padding
//   offset 64–79 : vec4f colorMultiplier
//   offset 80–95 : vec4f colorOffset
//   offset 96–111: f32 x0, y0, x1, y1 (quad pixel-space corners)
//   offset 112–127: f32 u0, v0, u1, v1 (texture coordinates)
// Total used: 128 bytes; slot size: minUniformBufferOffsetAlignment (≥256)
export const UNIFORM_BYTE_SIZE = 128;

const BITMAP_SHADER_SRC = /* wgsl */ `
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorTransform : u32,
  _pad0 : f32,
  _pad1 : f32,
  colorMultiplier : vec4f,
  colorOffset : vec4f,
  x0 : f32, y0 : f32, x1 : f32, y1 : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

// Quad corner order matching index pattern [0,1,2, 0,2,3]:
//   vi 0 → corner (x0,y0,u0,v0)
//   vi 1 → corner (x1,y0,u1,v0)
//   vi 2 → corner (x1,y1,u1,v1)
//   vi 3 → corner (x0,y0,u0,v0)  [repeated]
//   vi 4 → corner (x1,y1,u1,v1)  [repeated]
//   vi 5 → corner (x0,y1,u0,v1)

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let x = select(uni.x0, uni.x1, xi);
  let y = select(uni.y0, uni.y1, yi);
  let u = select(uni.u0, uni.u1, xi);
  let v = select(uni.v0, uni.v1, yi);
  let p = uni.matrix * vec3f(x, y, 1.0);
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.hasColorTransform != 0u && color.a > 0.0) {
    // Unpremultiply, apply transform, repremultiply
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * uni.colorMultiplier + uni.colorOffset, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color * clamp(uni.alpha, 0.0, 1.0);
}
`;

// Stencil-write pipeline: only writes to stencil, not color.
// Uses same vertex shader; fragment just discards to keep stencil logic in pipeline state.
const MASK_FRAGMENT_SRC = /* wgsl */ `
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorTransform : u32,
  _pad0 : f32,
  _pad1 : f32,
  colorMultiplier : vec4f,
  colorOffset : vec4f,
  x0 : f32, y0 : f32, x1 : f32, y1 : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let x = select(uni.x0, uni.x1, xi);
  let y = select(uni.y0, uni.y1, yi);
  let u = select(uni.u0, uni.u1, xi);
  let v = select(uni.v0, uni.v1, yi);
  let p = uni.matrix * vec3f(x, y, 1.0);
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  let s = textureSample(tex, smp, in.uv);
  if (s.a <= 0.0) { discard; }
  return vec4f(0.0);
}
`;

// ---- Blend mode → GPUBlendState ----

type StencilMode = 'normal' | 'masked' | 'maskwrite';

const NORMAL_BLEND: GPUBlendState = createWgpuBlendState('one', 'one-minus-src-alpha');

// The fixed-function realizations, mirroring render-gl's DEFAULT_GL_BLEND_MODES. Both channels share
// one component (WebGPU reads the alpha part of a color factor in the alpha slot, so a single factor
// reproduces GL's non-separate blendFunc). Alpha, Invert, and Shader stay null — they have no
// fixed-function equivalent and degrade to normal premultiplied compositing. The destination-reading
// advanced modes (Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn/HSL) are not in
// the fixed-function BlendMode enum at all — they are a BlendEffect composite recipe, not a node
// property, so there is nothing to map here.
const BLEND_MODES: Record<BlendMode, GPUBlendState | null> = {
  [BlendMode.Add]: createWgpuBlendState('one', 'one'),
  [BlendMode.Alpha]: null,
  [BlendMode.Darken]: createWgpuBlendState('one', 'one', 'min'),
  [BlendMode.Erase]: createWgpuBlendState('zero', 'one-minus-src-alpha'),
  [BlendMode.Invert]: null,
  [BlendMode.Layer]: NORMAL_BLEND,
  [BlendMode.Lighten]: createWgpuBlendState('one', 'one', 'max'),
  // Premultiplied multiply: src.rgb*dst + dst*(1-src.a), so transparent/partial pixels leave the
  // backdrop untouched instead of multiplying it toward black. Matches render-gl.
  [BlendMode.Multiply]: createWgpuBlendState('dst', 'one-minus-src-alpha'),
  // No blending: the source replaces the destination (matches Normal for opaque content).
  [BlendMode.None]: createWgpuBlendState('one', 'zero'),
  [BlendMode.Normal]: NORMAL_BLEND,
  [BlendMode.Screen]: createWgpuBlendState('one', 'one-minus-src'),
  [BlendMode.Shader]: null,
  [BlendMode.Subtract]: createWgpuBlendState('one', 'one', 'reverse-subtract'),
};

// ---- Pipeline creation ----

export function createWgpuBindGroupLayouts(device: GPUDevice): {
  uniformBindGroupLayout: GPUBindGroupLayout;
  textureBindGroupLayout: GPUBindGroupLayout;
} {
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: UNIFORM_BYTE_SIZE },
      },
    ],
  });

  const textureBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  return { uniformBindGroupLayout, textureBindGroupLayout };
}

export function createWgpuPipelineLayout(
  device: GPUDevice,
  uniformBindGroupLayout: GPUBindGroupLayout,
  textureBindGroupLayout: GPUBindGroupLayout,
): GPUPipelineLayout {
  return device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout, textureBindGroupLayout],
  });
}

function buildStencilFaceState(stencilMode: StencilMode): GPUStencilFaceState {
  if (stencilMode === 'maskwrite') {
    return { compare: 'always', passOp: 'replace', failOp: 'keep', depthFailOp: 'keep' };
  }
  if (stencilMode === 'masked') {
    return { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
  }
  return { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
}

export function getActiveWgpuPipeline(state: WgpuRenderState): GPURenderPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  const stencilMode: StencilMode = runtime.maskWriteMode
    ? 'maskwrite'
    : runtime.currentMaskDepth > 0
      ? 'masked'
      : 'normal';
  return getWgpuPipeline(state, runtime.currentBlendMode, stencilMode);
}

export function getWgpuPipeline(
  state: WgpuRenderState,
  blendMode: BlendMode | null,
  stencilMode: StencilMode,
): GPURenderPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  // The pipeline bakes its color-attachment format, so key on the current target format too (rgba16float
  // inside an HDR effect target vs the canvas format).
  const format = runtime.currentColorFormat ?? state.format;
  const key = `${blendMode ?? 'null'}-${stencilMode}-${format}`;
  const cached = runtime.pipelineCache.get(key);
  if (cached !== undefined) return cached;

  const blend = (blendMode !== null ? BLEND_MODES[blendMode] : null) ?? NORMAL_BLEND;
  const isMaskWrite = stencilMode === 'maskwrite';
  const stencilFace = buildStencilFaceState(stencilMode);

  const { device } = state;
  const shaderSrc = isMaskWrite ? MASK_FRAGMENT_SRC : BITMAP_SHADER_SRC;
  const module = device.createShaderModule({ code: shaderSrc });
  const layout = createWgpuPipelineLayout(device, runtime.uniformBindGroupLayout, runtime.textureBindGroupLayout);

  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: isMaskWrite ? undefined : blend,
          writeMask: isMaskWrite ? 0 : GPUColorWrite.ALL,
        },
      ],
    },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: stencilFace,
      stencilBack: stencilFace,
      stencilReadMask: 0xff,
      stencilWriteMask: isMaskWrite ? 0xff : 0x00,
    },
    primitive: { topology: 'triangle-list' },
  });

  runtime.pipelineCache.set(key, pipeline);
  return pipeline;
}

// ---- Matrix helpers ----

export function setWgpuMatrixFromTransform(
  matrixArray: Float32Array,
  t: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  viewport: { width: number; height: number },
): void {
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;
  // Column-major mat3x3 with vec3-to-16-byte padding:
  // col0
  matrixArray[0] = t.a * iw;
  matrixArray[1] = -t.b * ih;
  matrixArray[2] = 0;
  // col1
  matrixArray[3] = t.c * iw;
  matrixArray[4] = -t.d * ih;
  matrixArray[5] = 0;
  // col2
  matrixArray[6] = t.tx * iw - 1;
  matrixArray[7] = -t.ty * ih + 1;
  matrixArray[8] = 1;
}

// ---- Uniform slot writing ----

export function writeWgpuMatrixOnlyUniforms(
  state: WgpuRenderState,
  renderProxy: RenderProxy,
  transform: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): number {
  return writeWgpuQuadUniforms(
    state,
    { alpha: renderProxy.alpha, transform2D: transform },
    null,
    x0,
    y0,
    x1,
    y1,
    u0,
    v0,
    u1,
    v1,
  );
}

// Writes the standard uniforms (matrix + alpha + color transform + quad coords) into
// the ring buffer at the current uniformOffset, then advances the offset by uniformStride.
// Returns the byte offset of the slot just written (for use as the dynamic offset in setBindGroup).
export function writeWgpuQuadUniforms(
  state: WgpuRenderState,
  renderProxy: {
    alpha: number;
    transform2D: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  },
  colorTransform: ColorTransform | null,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): number {
  const runtime = getWgpuRenderStateRuntime(state);
  const byteOffset = runtime.uniformOffset;
  const floatBase = byteOffset >> 2; // divide by 4
  const { uniformData, uniformDataU32, matrixArray } = runtime;

  const viewport = runtime.renderTargetViewport ?? state.canvas;
  setWgpuMatrixFromTransform(matrixArray, renderProxy.transform2D, viewport);

  // mat3x3 columns with per-column padding (4 floats each = 16 bytes):
  uniformData[floatBase + 0] = matrixArray[0];
  uniformData[floatBase + 1] = matrixArray[1];
  uniformData[floatBase + 2] = matrixArray[2];
  uniformData[floatBase + 3] = 0;
  uniformData[floatBase + 4] = matrixArray[3];
  uniformData[floatBase + 5] = matrixArray[4];
  uniformData[floatBase + 6] = matrixArray[5];
  uniformData[floatBase + 7] = 0;
  uniformData[floatBase + 8] = matrixArray[6];
  uniformData[floatBase + 9] = matrixArray[7];
  uniformData[floatBase + 10] = matrixArray[8];
  uniformData[floatBase + 11] = 0;
  // alpha at float 12 (byte 48)
  uniformData[floatBase + 12] = renderProxy.alpha;
  // hasColorTransform at float 13 (byte 52) — written as u32. The color transform comes from the
  // node's material (resolved by the caller); null → identity.
  uniformDataU32[floatBase + 13] = colorTransform !== null ? 1 : 0;
  // padding floats 14–15
  uniformData[floatBase + 14] = 0;
  uniformData[floatBase + 15] = 0;
  // colorMultiplier at float 16–19 (byte 64–79)
  uniformData[floatBase + 16] = colorTransform?.redMultiplier ?? 1;
  uniformData[floatBase + 17] = colorTransform?.greenMultiplier ?? 1;
  uniformData[floatBase + 18] = colorTransform?.blueMultiplier ?? 1;
  uniformData[floatBase + 19] = colorTransform?.alphaMultiplier ?? 1;
  // colorOffset at float 20–23 (byte 80–95)
  uniformData[floatBase + 20] = (colorTransform?.redOffset ?? 0) / 255;
  uniformData[floatBase + 21] = (colorTransform?.greenOffset ?? 0) / 255;
  uniformData[floatBase + 22] = (colorTransform?.blueOffset ?? 0) / 255;
  uniformData[floatBase + 23] = (colorTransform?.alphaOffset ?? 0) / 255;
  // quad corners at float 24–31 (byte 96–127)
  uniformData[floatBase + 24] = x0;
  uniformData[floatBase + 25] = y0;
  uniformData[floatBase + 26] = x1;
  uniformData[floatBase + 27] = y1;
  uniformData[floatBase + 28] = u0;
  uniformData[floatBase + 29] = v0;
  uniformData[floatBase + 30] = u1;
  uniformData[floatBase + 31] = v1;

  runtime.uniformOffset += runtime.uniformStride;
  return byteOffset;
}

// One GPUBlendComponent shared by both channels. WebGPU applies the alpha part of a color factor
// (e.g. 'dst' → Ad) in the alpha slot, so a single factor pair reproduces GL's non-separate
// blendFunc. For min/max/reverse-subtract the factors are ignored but must still be valid.
function createWgpuBlendState(
  srcFactor: GPUBlendFactor,
  dstFactor: GPUBlendFactor,
  operation: GPUBlendOperation = 'add',
): GPUBlendState {
  const component: GPUBlendComponent = { srcFactor, dstFactor, operation };
  return { color: component, alpha: component };
}
