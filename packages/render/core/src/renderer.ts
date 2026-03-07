import type { Renderer, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export function setDefaultRenderer(state: RenderState, type: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(type) === renderer) return;
  (state as RenderStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(type, renderer);
}
