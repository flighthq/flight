import { areRenderRegistryGuardsEnabled, enableRenderRegistryGuards } from '@flighthq/render/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';

export function areWgpuTextureResolverGuardsEnabled(state: WgpuRenderState): boolean {
  return areRenderRegistryGuardsEnabled(state);
}

export function enableWgpuTextureResolverGuards(state: WgpuRenderState): void {
  enableRenderRegistryGuards(state);
}
