import type { LogState } from '@flighthq/log/contract';
import { areRenderRegistriesGuardsEnabled, enableRenderRegistriesGuards } from '@flighthq/render/contract';

import type { GlRenderState } from './contract.render-gl-types.ts';

export function areGlTextureResolverGuardsEnabled(state: GlRenderState): boolean {
  return areRenderRegistriesGuardsEnabled(state);
}

export function enableGlTextureResolverGuards(state: GlRenderState, logState: LogState | null): void {
  enableRenderRegistriesGuards(state, logState);
}
