import { createEntity } from '@flighthq/entity';
import { getSceneNodeRuntime, invalidateAppearance } from '@flighthq/scene';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  ImageRenderCacheResult,
  Renderer,
  RenderNodeResolver,
  RenderPrimitive,
  RenderState,
  SceneNode,
  SceneNodeRuntime,
} from '@flighthq/types';

import { registerRenderer } from './renderer';
import { syncRenderNodeRenderer } from './renderNode';
import { createDisplayObjectRenderNode } from './renderNode2d';

export const ImageRenderCacheKind: unique symbol = Symbol('ImageRenderCache');
export type ImageRenderCacheKind = typeof ImageRenderCacheKind;

export interface ImageRenderCachePrimitive extends RenderPrimitive {
  cache: ImageRenderCacheResult;
  kind: ImageRenderCacheKind;
  owner: DisplayObject;
}

// ─── Capture state ────────────────────────────────────────────────────────────

const _capturingStates = new WeakSet<RenderState>();

// ─── Resolver ─────────────────────────────────────────────────────────────────

type ImageRenderCacheResolver = RenderNodeResolver & {
  getNode: (state: RenderState, source: DisplayObject) => DisplayObjectRenderNode;
  result: ImageRenderCacheResult | null;
};

// ─── Exported functions (alphabetical) ───────────────────────────────────────

export function beginImageRenderCacheCapture(state: RenderState): void {
  _capturingStates.add(state);
}

export function clearImageRenderCache(source: SceneNode<symbol, object>): void {
  (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver = null;
  invalidateAppearance(source);
}

export function createImageRenderCachePrimitive(
  owner: DisplayObject,
  cache: ImageRenderCacheResult,
): ImageRenderCachePrimitive {
  return createEntity({ cache, kind: ImageRenderCacheKind, owner });
}

export function createRenderImageCacheResolver(): ImageRenderCacheResolver {
  const _primitivesByState = new WeakMap<RenderState, ImageRenderCachePrimitive>();
  const _nodesByState = new WeakMap<RenderState, DisplayObjectRenderNode>();

  const resolver: ImageRenderCacheResolver = {
    result: null,

    resolve(state: RenderState, source: DisplayObject): boolean | null {
      if (_capturingStates.has(state)) return null;
      const cache = resolver.result;
      if (cache?.source?.src == null) return null;

      let primitive = _primitivesByState.get(state);
      if (primitive === undefined) {
        primitive = createImageRenderCachePrimitive(source, cache);
        _primitivesByState.set(state, primitive);
      } else {
        primitive.cache = cache;
      }

      let node = _nodesByState.get(state);
      if (node === undefined) {
        node = createDisplayObjectRenderNode(state, source);
        _nodesByState.set(state, node);
      }
      node.source = primitive;
      node.kind = primitive.kind;
      node.presentationTransform2D = cache.transform;
      syncRenderNodeRenderer(state, node);

      return false;
    },

    getNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
      let node = _nodesByState.get(state);
      if (node === undefined) {
        node = createDisplayObjectRenderNode(state, source);
        _nodesByState.set(state, node);
      }
      return node;
    },
  };

  return resolver;
}

export function endImageRenderCacheCapture(state: RenderState): void {
  _capturingStates.delete(state);
}

export function getImageRenderCache(source: SceneNode<symbol, object>): ImageRenderCacheResult | null {
  const resolver = (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver;
  return isRenderImageCacheResolver(resolver) ? resolver.result : null;
}

export function isImageRenderCachePrimitive(source: unknown): source is ImageRenderCachePrimitive {
  return (
    typeof source === 'object' && source !== null && (source as ImageRenderCachePrimitive).kind === ImageRenderCacheKind
  );
}

export function isRenderImageCacheResolver(value: unknown): value is ImageRenderCacheResolver {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ImageRenderCacheResolver).resolve === 'function' &&
    'result' in value
  );
}

export function registerImageRenderCacheRenderer(state: RenderState, renderer: Renderer): void {
  registerRenderer(state, ImageRenderCacheKind, renderer);
}

export function setImageRenderCache(source: SceneNode<symbol, object>, result: ImageRenderCacheResult): void {
  const runtime = getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>;
  if (!isRenderImageCacheResolver(runtime.resolver)) {
    runtime.resolver = createRenderImageCacheResolver();
  }
  (runtime.resolver as ImageRenderCacheResolver).result = result;
  invalidateAppearance(source);
}
