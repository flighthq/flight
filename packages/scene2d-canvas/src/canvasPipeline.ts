import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { CanvasRenderRegistries } from '@flighthq/types/contract';

export function allocateEmptyCanvasRenderRegistries(): CanvasRenderRegistries {
  const out = {} as CanvasRenderRegistries;
  initializeEmptyCanvasRenderRegistries(out);
  return out;
}

export function initializeEmptyCanvasRenderRegistries(out: CanvasRenderRegistries): void {
  out.renderEffects = createKeyedTable('CanvasRenderEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.strokeTessellator = createSlotTable('StrokeTessellator', 'Rasterize');
}
