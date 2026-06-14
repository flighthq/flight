import { createEntity } from '@flighthq/entity';
import { multiplyMatrix } from '@flighthq/geometry';
import { invalidateAppearance } from '@flighthq/node';
import type {
  ImageRenderCacheAdapter,
  ImageRenderCachePrimitive,
  ImageRenderCacheResult,
  Renderable,
  Renderer,
  RenderNode2D,
  RenderState,
  SceneNode,
} from '@flighthq/types';
import { ImageRenderCacheKind } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { getRenderNodeAdapter, setRenderNodeAdapter } from './renderNodeAdapter';

export { ImageRenderCacheKind };
export type { ImageRenderCacheAdapter, ImageRenderCachePrimitive };

const _capturingStates = new WeakSet<RenderState>();

export function beginImageRenderCacheCapture(state: RenderState): void {
  _capturingStates.add(state);
}

export function clearImageRenderCache(source: SceneNode<symbol, object>): void {
  setRenderNodeAdapter(source, null);
}

export function createImageRenderCachePrimitive(
  owner: Renderable,
  cache: ImageRenderCacheResult,
): ImageRenderCachePrimitive {
  return createEntity({ cache, kind: ImageRenderCacheKind, owner });
}

export function createRenderImageCacheAdapter(): ImageRenderCacheAdapter {
  const _primitivesByState = new WeakMap<RenderState, ImageRenderCachePrimitive>();

  const adapter: ImageRenderCacheAdapter = {
    result: null,

    adapt(state: RenderState, source: Renderable, node: RenderNode2D): boolean | null {
      if (_capturingStates.has(state)) return null;
      const cache = adapter.result;
      if (cache?.source?.src == null) return null;

      let primitive = _primitivesByState.get(state);
      if (primitive === undefined) {
        primitive = createImageRenderCachePrimitive(source, cache);
        _primitivesByState.set(state, primitive);
      } else {
        primitive.cache = cache;
      }

      node.source = primitive;
      node.kind = primitive.kind;
      multiplyMatrix(node.transform2D, node.transform2D, cache.transform);

      return false;
    },
  };

  return adapter;
}

export function endImageRenderCacheCapture(state: RenderState): void {
  _capturingStates.delete(state);
}

export function getImageRenderCache(source: SceneNode<symbol, object>): ImageRenderCacheResult | null {
  const adapter = getRenderNodeAdapter(source);
  return isRenderImageCacheAdapter(adapter) ? adapter.result : null;
}

export function isImageRenderCachePrimitive(source: unknown): source is ImageRenderCachePrimitive {
  return (
    typeof source === 'object' && source !== null && (source as ImageRenderCachePrimitive).kind === ImageRenderCacheKind
  );
}

export function isRenderImageCacheAdapter(value: unknown): value is ImageRenderCacheAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ImageRenderCacheAdapter).adapt === 'function' &&
    'result' in value
  );
}

export function registerImageRenderCacheRenderer(state: RenderState, renderer: Renderer): void {
  registerRenderer(state, ImageRenderCacheKind, renderer);
}

export function setImageRenderCache(source: SceneNode<symbol, object>, result: ImageRenderCacheResult): void {
  let adapter = getRenderNodeAdapter(source);
  if (!isRenderImageCacheAdapter(adapter)) {
    adapter = createRenderImageCacheAdapter();
    setRenderNodeAdapter(source, adapter);
  }
  (adapter as ImageRenderCacheAdapter).result = result;
  invalidateAppearance(source);
}
