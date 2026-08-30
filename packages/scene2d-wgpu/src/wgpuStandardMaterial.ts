import { getWgpuRenderStateRuntime, registerWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import type { WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import { getWgpuQuadBatchPreludeWGSL } from './wgpuQuadBatchWriter';

// Registers the bundled default material under StandardMaterialKind. It is a bundled material like any
// other — no privileged status in the render path; a node with no material renders only if a renderer
// is registered for StandardMaterialKind. A user can copy this file and register their own default.
export function registerWgpuStandardMaterial(state: WgpuRenderState): void {
  registerWgpuMaterialRenderer(state, StandardMaterialKind, standardWgpuMaterialRenderer);
}

// Textured quad with per-instance alpha and no other effect. The batch holds no shader of its own, so
// even the plain path is just a registered material — this module IS the base quad-batch writer shader.
export const standardWgpuMaterialRenderer: WgpuMaterialRenderer = {
  instanceFloatCount: 0,
  getShaderModule(state: WgpuRenderState): GPUShaderModule {
    const runtime = getWgpuRenderStateRuntime(state);
    const cached = runtime.context.standardMaterialModule;
    if (cached !== undefined) return cached;
    const module = state.device.createShaderModule({
      code: getWgpuQuadBatchPreludeWGSL() + STANDARD_MATERIAL_WGSL,
    });
    runtime.context.standardMaterialModule = module;
    return module;
  },
};

const STANDARD_MATERIAL_WGSL = /* wgsl */ `
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
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color * clamp(in.alpha, 0.0, 1.0);
}
`;
