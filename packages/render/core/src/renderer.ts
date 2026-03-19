import type { Renderable, Renderer, RendererData, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export function createNullRendererData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function registerRenderer(state: RenderState, kind: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(kind) === renderer) return;
  (state as RenderStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(kind, renderer);
}
