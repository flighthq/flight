import type { Renderer, RendererState } from '@flighthq/types';

import type { RendererStateInternal } from './internal';

export function registerRenderer(state: RendererState, kind: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(kind) === renderer) return;
  (state as RendererStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(kind, renderer);
}
