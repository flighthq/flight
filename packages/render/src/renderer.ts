import type { Kind, Renderable, Renderer, RendererData, RenderState } from '@flighthq/types/contract';

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

export function registerRenderer(state: RenderState, kind: Kind, renderer: Renderer): void {
  const runtime = getRenderStateRuntime(state);
  if (runtime.rendererMap.get(kind) === renderer) return;
  runtime.rendererMapId = (runtime.rendererMapId + 1) >>> 0;
  runtime.rendererMap.set(kind, renderer);
}

// Batch form of registerRenderer over a caller-supplied set of [kind, renderer] pairs. The registry
// stays open and tree-shakable: only the renderers the caller references are pulled in — there is no
// "register all built-ins" set, which would force every renderer into the bundle.
export function registerRenderers(state: RenderState, entries: ReadonlyArray<readonly [Kind, Renderer]>): void {
  for (const [kind, renderer] of entries) registerRenderer(state, kind, renderer);
}
