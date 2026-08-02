import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState, ShapeRasterizer } from '@flighthq/types/contract';

export function getWgpuShapeRasterizer(state: WgpuRenderState): ShapeRasterizer | null {
  return getWgpuRenderStateRuntime(state).shapeRasterizer ?? null;
}

// Installs the fallback that draws fills the mesh path cannot express. Registration is the opt-in: a
// state without one draws its solid shapes and reports the rest as a registry miss, and nothing here
// reaches for a rasterizer the caller did not name. Pass null to remove one.
export function registerWgpuShapeRasterizer(state: WgpuRenderState, rasterizer: ShapeRasterizer | null): void {
  getWgpuRenderStateRuntime(state).shapeRasterizer = rasterizer;
}
