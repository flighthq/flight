import type { DomRenderState, ShapeRasterizer } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function getDomShapeRasterizer(state: DomRenderState): ShapeRasterizer | null {
  const entry = getDomRenderStateRuntime(state).registries.shapeRasterizer.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

// Installs the fallback that draws fills the mesh path cannot express. Registration is the opt-in: a
// state without one draws its solid shapes and reports the rest as a registry miss, and nothing here
// reaches for a rasterizer the caller did not name. Pass null to remove one.
export function registerDomShapeRasterizer(state: DomRenderState, rasterizer: ShapeRasterizer | null): void {
  const runtime = getDomRenderStateRuntime(state);
  const table = runtime.registries.shapeRasterizer;
  runtime.registries.shapeRasterizer = {
    ...table,
    entry: rasterizer === null ? null : { state: RegistryEntryState.Bound, value: rasterizer },
  };
}
