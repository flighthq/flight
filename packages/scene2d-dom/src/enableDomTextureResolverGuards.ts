import { areRenderRegistryGuardsEnabled, enableRenderRegistryGuards } from '@flighthq/render/contract';
import type { DomRenderState } from '@flighthq/types/contract';

export function areDomTextureResolverGuardsEnabled(state: DomRenderState): boolean {
  return areRenderRegistryGuardsEnabled(state);
}

export function enableDomTextureResolverGuards(state: DomRenderState): void {
  enableRenderRegistryGuards(state);
}
