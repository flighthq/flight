import { createEntity } from '@flighthq/entity';
import { createMatrix, multiplyMatrix } from '@flighthq/geometry';
import { createSignal } from '@flighthq/signals';
import type { Renderable, RenderCache, RenderCacheAdapter, Renderer, RenderState } from '@flighthq/types';
import { RenderCacheKind } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { getRenderProxyAdapter, setRenderProxyAdapter } from './renderProxyAdapter';

export { RenderCacheKind };
export type { RenderCache, RenderCacheAdapter };

/**
 * Creates a backend-agnostic cache handle. The handle owns no resource; a backend
 * allocates and stores its own render target on the render state, keyed by this handle,
 * when the cache is first refreshed.
 */
export function createRenderCache(): RenderCache {
  return createEntity({ kind: RenderCacheKind, transform: createMatrix() });
}

/**
 * Creates an adapter that, during the render update pass, substitutes its cache handle
 * for `source` so the cached result is composited instead of the source subtree being
 * traversed. Returns null from `adapt` (renders normally) until a cache is attached.
 */
export function createRenderCacheAdapter(cache: RenderCache | null = null): RenderCacheAdapter {
  const adapter: RenderCacheAdapter = {
    cache,
    signals: null,

    adapt(_state, _source, node) {
      adapter.signals?.onPrepare.emit();
      const attached = adapter.cache ?? null;
      if (attached === null) return null;
      // Switch the render node to the cache renderer and fold in the cache's placement
      // transform, but keep node.source as the original scene node — the appearance and
      // transform passes read node.source every (dirty) frame, and the handle is not a Node.
      // The cache renderer resolves the handle from this adapter via getRenderProxyCache.
      node.kind = RenderCacheKind;
      multiplyMatrix(node.transform2D, node.transform2D, attached.transform);
      return false;
    },
  };
  return adapter;
}

/**
 * Opts an adapter into the onPrepare signal, emitted each time the adapter is consulted
 * during the update pass — a hook for refreshing the cache lazily before it is composited.
 */
export function enableRenderCacheAdapterSignals(adapter: RenderCacheAdapter): void {
  adapter.signals ??= { onPrepare: createSignal() };
}

/**
 * Resolves the cache handle a cache renderer should composite for a render node, by reading the
 * cache adapter attached to the node's source on this state. Returns null if none is attached.
 */
export function getRenderProxyCache(state: RenderState, source: Renderable): RenderCache | null {
  const adapter = getRenderProxyAdapter(state, source);
  return isRenderCacheAdapter(adapter) ? (adapter.cache ?? null) : null;
}

export function isRenderCache(source: unknown): source is RenderCache {
  return typeof source === 'object' && source !== null && (source as RenderCache).kind === RenderCacheKind;
}

export function isRenderCacheAdapter(value: unknown): value is RenderCacheAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RenderCacheAdapter).adapt === 'function' &&
    'cache' in (value as RenderCacheAdapter)
  );
}

export function registerRenderCacheRenderer(state: RenderState, renderer: Renderer): void {
  registerRenderer(state, RenderCacheKind, renderer);
}

/**
 * Attaches `cache` to `source` on this state: subsequent renders composite the cache
 * instead of rendering the source subtree. Reuses an existing cache adapter on the source
 * if present. The cache shows nothing until it is refreshed with content.
 */
export function useRenderCache(state: RenderState, source: Renderable, cache: RenderCache): RenderCacheAdapter {
  const existing = getRenderProxyAdapter(state, source);
  if (isRenderCacheAdapter(existing)) {
    existing.cache = cache;
    return existing;
  }
  const adapter = createRenderCacheAdapter(cache);
  setRenderProxyAdapter(state, source, adapter);
  return adapter;
}
