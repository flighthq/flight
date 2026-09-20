import { createKeyedTable } from '@flighthq/registry/contract';
import type { CanvasRenderRegistries } from '@flighthq/types/contract';

export function allocateEmptyCanvasRenderRegistries(): CanvasRenderRegistries {
  const out = {} as CanvasRenderRegistries;
  initializeEmptyCanvasRenderRegistries(out);
  return out;
}

export function initializeEmptyCanvasRenderRegistries(out: CanvasRenderRegistries): void {
  // Written as null rather than omitted: the field's presence is what keeps every registries object
  // one hidden class, so the per-shape reads on the draw path stay monomorphic. The opt-in registrar
  // fills the slot; a pipeline nobody opts in on allocates no table.
  out.strokeTessellator = null;

  out.effects = createKeyedTable('CanvasEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
}
