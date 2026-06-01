import type {
  DisplayObject,
  DisplayObjectRenderNode,
  Renderable,
  Renderer,
  RendererData,
  RenderState,
} from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export type DisplayObjectKindTransformerResult = {
  kind: symbol;
  updateChildren: boolean;
  dirty?: boolean;
};

export type DisplayObjectKindTransformer = (
  state: RenderState,
  source: DisplayObject,
  data: DisplayObjectRenderNode,
) => DisplayObjectKindTransformerResult | null;

export function copyRendererRegistrations(target: RenderState, source: RenderState): void {
  source.rendererMap.forEach((renderer, kind) => {
    registerRenderer(target, kind, renderer);
  });
}

export function createNullRendererData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function registerDisplayObjectKindTransformer(
  state: RenderState,
  transformer: DisplayObjectKindTransformer,
): void {
  (state as RenderStateInternal).displayObjectKindTransformers.push(transformer);
}

export function registerRenderer(state: RenderState, kind: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(kind) === renderer) return;
  (state as RenderStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(kind, renderer);
}
