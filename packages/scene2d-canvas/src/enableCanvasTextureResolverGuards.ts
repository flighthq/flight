import { areRenderRegistryGuardsEnabled, enableRenderRegistryGuards } from '@flighthq/render/contract';
import type { CanvasRenderState } from '@flighthq/types/contract';

export function areCanvasTextureResolverGuardsEnabled(state: CanvasRenderState): boolean {
  return areRenderRegistryGuardsEnabled(state);
}

export function enableCanvasTextureResolverGuards(state: CanvasRenderState): void {
  enableRenderRegistryGuards(state);
}
