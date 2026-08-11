import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState, ShapeRasterizer } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

export function getWgpuShapeRasterizer(state: WgpuRenderState): ShapeRasterizer | null {
  const entry = getWgpuRenderStateRuntime(state).registries.shapeRasterizer.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

// Installs the fallback that draws fills the mesh path cannot express. Registration is the opt-in: a
// state without one draws its solid shapes and reports the rest as a registry miss, and nothing here
// reaches for a rasterizer the caller did not name. Pass null to remove one.
export function registerWgpuShapeRasterizer(state: WgpuRenderState, rasterizer: ShapeRasterizer | null): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.shapeRasterizer;
  runtime.registries.shapeRasterizer = {
    ...table,
    entry: rasterizer === null ? null : { state: RegistryEntryState.Bound, value: rasterizer },
  };
}
