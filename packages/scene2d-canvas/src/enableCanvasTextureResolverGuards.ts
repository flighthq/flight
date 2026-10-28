import type { LogState } from '@flighthq/log/contract';
import { areRenderRegistriesGuardsEnabled, enableRenderRegistriesGuards } from '@flighthq/render/contract';
import type { CanvasRenderState } from '@flighthq/types/contract';

export function areCanvasTextureResolverGuardsEnabled(state: CanvasRenderState): boolean {
  return areRenderRegistriesGuardsEnabled(state);
}

export function enableCanvasTextureResolverGuards(state: CanvasRenderState, logState: LogState | null): void {
  enableRenderRegistriesGuards(state, logState);
}
