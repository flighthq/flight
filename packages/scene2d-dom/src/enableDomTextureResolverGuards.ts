import type { LogState } from '@flighthq/log/contract';
import { areRenderRegistriesGuardsEnabled, enableRenderRegistriesGuards } from '@flighthq/render/contract';
import type { DomRenderState } from '@flighthq/types/contract';

export function areDomTextureResolverGuardsEnabled(state: DomRenderState): boolean {
  return areRenderRegistriesGuardsEnabled(state);
}

export function enableDomTextureResolverGuards(state: DomRenderState, logState: LogState | null): void {
  enableRenderRegistriesGuards(state, logState);
}
