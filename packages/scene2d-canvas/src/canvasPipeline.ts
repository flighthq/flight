import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { CanvasRenderRegistry } from '@flighthq/types/contract';

export function createEmptyCanvasRenderRegistry(): CanvasRenderRegistry {
  const out = {} as CanvasRenderRegistry;
  initializeEmptyCanvasRenderRegistry(out);
  return out;
}

export function initializeEmptyCanvasRenderRegistry(out: CanvasRenderRegistry): void {
  out.renderEffects = createKeyedTable('CanvasRenderEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.strokeTessellator = createSlotTable('StrokeTessellator', 'Rasterize');
}
