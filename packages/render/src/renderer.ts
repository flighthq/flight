import {
  type DisplayObjectMaskHooks,
  type DisplayObjectMaskRenderer,
  type Renderable,
  type Renderer,
  type RendererData,
  RenderFeatures,
  type RenderState,
} from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export function copyRenderersFromRenderState(target: RenderState, source: RenderState): void {
  source.rendererMap.forEach((renderer, kind) => {
    registerRenderer(target, kind, renderer);
  });
}

export function copyMaskRenderersFromRenderState(target: RenderState, source: RenderState): void {
  source.displayObjectMaskRendererMap.forEach((renderer, kind) => {
    registerDisplayObjectMaskRenderer(target, kind, renderer);
  });
  if (source.displayObjectMaskHooks !== null) setDisplayObjectMaskHooks(target, source.displayObjectMaskHooks);
}

export function copyFromRenderState(target: RenderState, source: RenderState): void {
  copyRenderersFromRenderState(target, source);
  copyMaskRenderersFromRenderState(target, source);
}

export function createNullRendererData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function disableRenderFeatures(state: RenderState, features: RenderFeatures): void {
  state.renderFeatures = RenderFeatures.remove(state.renderFeatures, features);
}

export function enableRenderFeatures(state: RenderState, features: RenderFeatures): void {
  state.renderFeatures = RenderFeatures.add(state.renderFeatures, features);
}

export function hasRenderFeatures(state: RenderState, features: RenderFeatures): boolean {
  return RenderFeatures.has(state.renderFeatures, features);
}

export function registerDisplayObjectMaskRenderer(
  state: RenderState,
  kind: symbol,
  renderer: DisplayObjectMaskRenderer,
): void {
  enableRenderFeatures(state, RenderFeatures.Masks);
  if (state.displayObjectMaskRendererMap.get(kind) === renderer) return;
  (state as RenderStateInternal).displayObjectMaskRendererMapID = (state.displayObjectMaskRendererMapID + 1) >>> 0;
  state.displayObjectMaskRendererMap.set(kind, renderer);
}

export function registerRenderer(state: RenderState, kind: symbol, renderer: Renderer): void {
  if (state.rendererMap.get(kind) === renderer) return;
  (state as RenderStateInternal).rendererMapID = (state.rendererMapID + 1) >>> 0;
  state.rendererMap.set(kind, renderer);
}

export function setDisplayObjectMaskHooks(state: RenderState, hooks: DisplayObjectMaskHooks | null): void {
  state.displayObjectMaskHooks = hooks;
  if (hooks !== null) enableRenderFeatures(state, RenderFeatures.Masks);
}
