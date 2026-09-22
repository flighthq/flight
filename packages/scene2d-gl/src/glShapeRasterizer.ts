import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState, ShapeRasterizer } from '@flighthq/types/contract';

export function getGlShapeRasterizer(state: GlRenderState): ShapeRasterizer | null {
  const entry = getGlRenderStateRuntime(state).registries.shapeRasterizer;
  return entry ?? null;
}

// Installs the fallback that draws fills the mesh path cannot express. Registration is the opt-in: a
// state without one draws its solid shapes and reports the rest as a registry miss, and nothing here
// reaches for a rasterizer the caller did not name. Pass null to remove one.
export function registerGlShapeRasterizer(state: GlRenderState, rasterizer: ShapeRasterizer | null): void {
  getGlRenderStateRuntime(state).registries.shapeRasterizer = rasterizer;
}
