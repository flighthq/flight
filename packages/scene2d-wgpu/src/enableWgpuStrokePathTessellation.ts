import { tessellateStrokePath } from '@flighthq/path/contract';
import { createSlotTable } from '@flighthq/registry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

// Installs the closed-ring/pathology-aware stroke kernel only for states that need it. Ordinary shape
// bundles keep the compact open-outline mesh lane and rasterize closed strokes.
export function enableWgpuStrokePathTessellation(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.strokeTessellator ?? createSlotTable('StrokeTessellator', 'Rasterize');
  runtime.registries.strokeTessellator = {
    ...table,
    entry: { state: RegistryEntryState.Bound, value: tessellateStrokePath },
  };
}
