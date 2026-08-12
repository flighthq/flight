import { tessellateStrokePath } from '@flighthq/path/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

// Installs the closed-ring/pathology-aware stroke kernel only for states that need it. Ordinary shape
// bundles keep the compact open-outline mesh lane and rasterize closed strokes.
export function enableGlStrokePathTessellation(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const table = runtime.registries.strokeTessellator;
  runtime.registries.strokeTessellator = {
    ...table,
    entry: { state: RegistryEntryState.Bound, value: tessellateStrokePath },
  };
}
