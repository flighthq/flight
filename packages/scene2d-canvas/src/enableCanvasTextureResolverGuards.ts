import { areRenderRegistriesGuardsEnabled, enableRenderRegistriesGuards } from '@flighthq/render/contract';
import type { CanvasRenderState } from '@flighthq/types/contract';

export function areCanvasTextureResolverGuardsEnabled(state: CanvasRenderState): boolean {
  return areRenderRegistriesGuardsEnabled(state);
}

export function enableCanvasTextureResolverGuards(state: CanvasRenderState): void {
  enableRenderRegistriesGuards(state);
}
