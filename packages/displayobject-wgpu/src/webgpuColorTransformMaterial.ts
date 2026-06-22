import { registerWgpuMaterialRenderer } from '@flighthq/render-wgpu';
import type {
  ColorTransform,
  UniformColorTransformMaterial,
  WgpuMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';
import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import { getWgpuQuadBatchPreludeWGSL } from './webgpuSpriteBatch';

const COLOR_TRANSFORM_INSTANCE_FLOATS = 8;

export function registerWgpuColorTransformMaterials(state: WgpuRenderState): void {
  registerWgpuMaterialRenderer(state, UniformColorTransformMaterialKind, uniformColorTransformWgpuMaterialRenderer);
  registerWgpuMaterialRenderer(state, ColorTransformMaterialKind, colorTransformWgpuMaterialRenderer);
}

// Per-instance color transform: packs each node's materialData color transform into the instance.
export const colorTransformWgpuMaterialRenderer: WgpuMaterialRenderer = {
  instanceFloatCount: COLOR_TRANSFORM_INSTANCE_FLOATS,
  getShaderModule: getColorTransformShaderModule,
  packInstance(_state, _material, materialData, out, offset): void {
    packWgpuColorTransform(out, offset, materialData as ColorTransform | null);
  },
};

// Per-batch color transform: packs the material's own color transform into every instance. Wgpu
// carries color transform per-instance, so a "uniform" color transform is the same value on each
// instance of the batch — it shares the per-instance shader module.
export const uniformColorTransformWgpuMaterialRenderer: WgpuMaterialRenderer = {
  instanceFloatCount: COLOR_TRANSFORM_INSTANCE_FLOATS,
  getShaderModule: getColorTransformShaderModule,
  packInstance(_state, material, _materialData, out, offset): void {
    const ct = material !== null ? (material as UniformColorTransformMaterial).colorTransform : null;
    packWgpuColorTransform(out, offset, ct);
  },
};

function getColorTransformShaderModule(state: WgpuRenderState): GPUShaderModule {
  const cached = _modules.get(state.device);
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + COLOR_TRANSFORM_MATERIAL_WGSL,
  });
  _modules.set(state.device, module);
  return module;
}

function packWgpuColorTransform(out: Float32Array, offset: number, ct: ColorTransform | null): void {
  if (ct !== null) {
    out[offset] = ct.redMultiplier;
    out[offset + 1] = ct.greenMultiplier;
    out[offset + 2] = ct.blueMultiplier;
    out[offset + 3] = ct.alphaMultiplier;
    out[offset + 4] = ct.redOffset / 255;
    out[offset + 5] = ct.greenOffset / 255;
    out[offset + 6] = ct.blueOffset / 255;
    out[offset + 7] = ct.alphaOffset / 255;
  } else {
    out[offset] = 1;
    out[offset + 1] = 1;
    out[offset + 2] = 1;
    out[offset + 3] = 1;
    out[offset + 4] = 0;
    out[offset + 5] = 0;
    out[offset + 6] = 0;
    out[offset + 7] = 0;
  }
}

// Reads 8 per-instance floats (color multiplier rgba, color offset rgba) from the material storage
// buffer at @group(3), applies them in unpremultiplied space. The base path never sees these — color
// transform is contained entirely in this module and its packInstance.
const COLOR_TRANSFORM_MATERIAL_WGSL = /* wgsl */ `
@group(3) @binding(0) var<storage, read> ctData : array<f32>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) ctMult : vec4f,
  @location(3) ctOff : vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  let b = ii * 8u;
  let ctMult = vec4f(ctData[b + 0u], ctData[b + 1u], ctData[b + 2u], ctData[b + 3u]);
  let ctOff = vec4f(ctData[b + 4u], ctData[b + 5u], ctData[b + 6u], ctData[b + 7u]);
  return VertexOut(bv.position, bv.uv, bv.alpha, ctMult, ctOff);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * in.ctMult + in.ctOff, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
`;

const _modules = new WeakMap<GPUDevice, GPUShaderModule>();
