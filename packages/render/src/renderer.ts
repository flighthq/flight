import type { Renderable, Renderer, RendererData, RenderState } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

// Mask renderers were retired (a mask is now a path ClipRegion realized by the backend clip hooks), so
// there is no mask-renderer registry to copy — only the kind→renderer map and the clip hooks.
export function copyAllRenderersFromRenderState(target: RenderState, source: RenderState): void {
  copyRenderersFromRenderState(target, source);
  if (source.displayObjectClipHooks !== null) target.displayObjectClipHooks = source.displayObjectClipHooks;
}

export function copyRenderersFromRenderState(target: RenderState, source: RenderState): void {
  getRenderStateRuntime(source).rendererMap.forEach((renderer, kind) => {
    registerRenderer(target, kind, renderer);
  });
}

export function noopRendererData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function registerRenderer(state: RenderState, kind: symbol, renderer: Renderer): void {
  const runtime = getRenderStateRuntime(state);
  if (runtime.rendererMap.get(kind) === renderer) return;
  runtime.rendererMapID = (runtime.rendererMapID + 1) >>> 0;
  runtime.rendererMap.set(kind, renderer);
}
