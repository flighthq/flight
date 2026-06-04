import { createEntity } from '@flighthq/entity';
import { multiplyMatrix } from '@flighthq/geometry';
import { getSceneNodeRuntime, invalidateAppearance } from '@flighthq/scene';
import type {
  ImageRenderCacheResult,
  Renderable,
  Renderer,
  RenderNode2D,
  RenderNodeAdapter,
  RenderPrimitive,
  RenderState,
  SceneNode,
  SceneNodeRuntime,
} from '@flighthq/types';

import { registerRenderer } from './renderer';

export const ImageRenderCacheKind: unique symbol = Symbol('ImageRenderCache');
export type ImageRenderCacheKind = typeof ImageRenderCacheKind;

export interface ImageRenderCachePrimitive extends RenderPrimitive {
  cache: ImageRenderCacheResult;
  kind: ImageRenderCacheKind;
  owner: Renderable;
}

export type ImageRenderCacheAdapter = RenderNodeAdapter & {
  result: ImageRenderCacheResult | null;
};

const _capturingStates = new WeakSet<RenderState>();

export function beginImageRenderCacheCapture(state: RenderState): void {
  _capturingStates.add(state);
}

export function clearImageRenderCache(source: SceneNode<symbol, object>): void {
  (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver = null;
  invalidateAppearance(source);
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
  const adapter = (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver;
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
  const runtime = getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>;
  if (!isRenderImageCacheAdapter(runtime.resolver)) {
    runtime.resolver = createRenderImageCacheAdapter();
  }
  (runtime.resolver as ImageRenderCacheAdapter).result = result;
  invalidateAppearance(source);
}
