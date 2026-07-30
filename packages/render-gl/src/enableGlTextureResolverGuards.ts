import { areRenderRegistryGuardsEnabled, enableRenderRegistryGuards } from '@flighthq/render/contract';
import type { GlRenderState } from '@flighthq/types/contract';

export function areGlTextureResolverGuardsEnabled(state: GlRenderState): boolean {
  return areRenderRegistryGuardsEnabled(state);
}

export function enableGlTextureResolverGuards(state: GlRenderState): void {
  enableRenderRegistryGuards(state);
}
