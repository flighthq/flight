import type { Renderer, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export function registerRenderer(state: RenderState, kind: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(kind) === renderer) return;
  (state as RenderStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(kind, renderer);
}
