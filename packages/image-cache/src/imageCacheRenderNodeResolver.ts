import { registerRenderer } from '@flighthq/render';
import { createDisplayObjectRenderNode, syncRenderNodeRenderer } from '@flighthq/render-tree';
import type {
  DisplayObject,
  DisplayObjectRenderTreeNode,
  ImageCacheResult,
  Renderer,
  RenderState,
  SceneNodeResolver,
} from '@flighthq/types';

import { ImageCacheKind } from './imageCacheKind';
import type { ImageCachePrimitive } from './imageCachePrimitive';
import { createImageCachePrimitive } from './imageCachePrimitive';

const _capturingStates = new WeakSet<RenderState>();

export function createImageCacheResolver(): ImageCacheResolver {
  return new ImageCacheResolver();
}

export function isImageCacheResolver(value: unknown): value is ImageCacheResolver {
  return value instanceof ImageCacheResolver;
}

export class ImageCacheResolver implements SceneNodeResolver {
  readonly updateChildren = false;
  result: ImageCacheResult | null = null;

  private _primitivesByState = new WeakMap<RenderState, ImageCachePrimitive>();
  private _nodesByState = new WeakMap<RenderState, DisplayObjectRenderTreeNode>();
  private _versionsByState = new WeakMap<RenderState, number>();

  resolve(
    state: RenderState,
    source: DisplayObject,
    _next: () => DisplayObjectRenderTreeNode,
  ): { node: DisplayObjectRenderTreeNode; dirty?: boolean } | null {
    if (_capturingStates.has(state)) return null;

    const cache = this.result;
    if (cache?.source?.src == null) return null;

    const primitiveResult = this._getOrCreatePrimitive(state, source, cache);
    const node = this._getOrCreateNode(state, source, primitiveResult.primitive);

    const version = cache.source.version;
    const lastVersion = this._versionsByState.get(state) ?? -1;
    const dirty = version !== lastVersion || primitiveResult.dirty;
    if (dirty) this._versionsByState.set(state, version);

    return { node, dirty };
  }

  private _getOrCreatePrimitive(
    state: RenderState,
    source: DisplayObject,
    cache: ImageCacheResult,
  ): { dirty: boolean; primitive: ImageCachePrimitive } {
    let primitive = this._primitivesByState.get(state);
    if (primitive === undefined) {
      primitive = createImageCachePrimitive(source, cache);
      this._primitivesByState.set(state, primitive);
      return { dirty: true, primitive };
    }
    const dirty = primitive.cache !== cache;
    primitive.cache = cache;
    return { dirty, primitive };
  }

  private _getOrCreateNode(
    state: RenderState,
    source: DisplayObject,
    primitive: ImageCachePrimitive,
  ): DisplayObjectRenderTreeNode {
    let node = this._nodesByState.get(state);
    if (node === undefined) {
      node = createDisplayObjectRenderNode(state, source);
      this._nodesByState.set(state, node);
    }
    node.kind = primitive.kind;
    node.presentationSource = primitive;
    node.presentationTransform2D = primitive.cache.transform;
    syncRenderNodeRenderer(state, node);
    return node;
  }
}

export function markImageCacheCapturing(state: RenderState): void {
  _capturingStates.add(state);
}

export function registerImageCacheRenderer(state: RenderState, renderer: Renderer): void {
  registerRenderer(state, ImageCacheKind, renderer);
}

export function unmarkImageCacheCapturing(state: RenderState): void {
  _capturingStates.delete(state);
}
