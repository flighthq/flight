import type { WebGPUMaterialRenderer, WebGPURenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { registerWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { getWebGPUQuadBatchPreludeWGSL } from './webgpuSpriteBatch';

// Registers the bundled default material under DefaultMaterialKind. It is a bundled material like any
// other — no privileged status in the render path; a node with no material renders only if a renderer
// is registered for DefaultMaterialKind. A user can copy this file and register their own default.
export function registerDefaultWebGPUMaterial(state: WebGPURenderState): void {
  registerWebGPUMaterialRenderer(state, DefaultMaterialKind, defaultWebGPUMaterialRenderer);
}

// Textured quad with per-instance alpha and no other effect. The batch holds no shader of its own, so
// even the plain path is just a registered material — this module IS the base sprite-batch shader.
export const defaultWebGPUMaterialRenderer: WebGPUMaterialRenderer = {
  instanceFloatCount: 0,
  getShaderModule(state: WebGPURenderState): GPUShaderModule {
    const internal = state as WebGPURenderStateInternal;
    const cached = _modules.get(internal.device);
    if (cached !== undefined) return cached;
    const module = internal.device.createShaderModule({
      code: getWebGPUQuadBatchPreludeWGSL() + DEFAULT_MATERIAL_WGSL,
    });
    _modules.set(internal.device, module);
    return module;
  },
};

const DEFAULT_MATERIAL_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  return VertexOut(bv.position, bv.uv, bv.alpha);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  return color * clamp(in.alpha, 0.0, 1.0);
}
`;

const _modules = new WeakMap<GPUDevice, GPUShaderModule>();
