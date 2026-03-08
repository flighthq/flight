import type { Renderable, Renderer, RendererData, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export function createNullRendererData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function setRenderer(state: RenderState, type: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(type) === renderer) return;
  (state as RenderStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(type, renderer);
}
