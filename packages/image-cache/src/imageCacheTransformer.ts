import { registerDisplayObjectKindTransformer, registerRenderer } from '@flighthq/render-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { DisplayObject, DisplayObjectRenderNode, Renderer, RenderState } from '@flighthq/types';

import { ImageCacheKind } from './imageCacheKind';

const _capturingStates = new WeakSet<RenderState>();
const _nodeVersions = new WeakMap<DisplayObject, number>();
const _transformerRegistered = new WeakSet<RenderState>();

export function markImageCacheCapturing(state: RenderState): void {
  _capturingStates.add(state);
}

export function registerImageCacheRenderer(state: RenderState, renderer: Renderer): void {
  if (!_transformerRegistered.has(state)) {
    _transformerRegistered.add(state);
    registerDisplayObjectKindTransformer(state, imageCacheTransformer);
  }
  registerRenderer(state, ImageCacheKind, renderer);
}

function imageCacheTransformer(
  state: RenderState,
  source: DisplayObject,
  _data: DisplayObjectRenderNode,
): { kind: symbol; updateChildren: boolean; dirty?: boolean } | null {
  if (_capturingStates.has(state)) return null;
  const cache = getDisplayObjectRuntime(source).imageCache;
  if (cache?.source?.src != null) {
    const version = cache.source.version;
    const lastVersion = _nodeVersions.get(source) ?? -1;
    const dirty = version !== lastVersion;
    if (dirty) _nodeVersions.set(source, version);
    return { kind: ImageCacheKind, updateChildren: false, dirty };
  }
  _nodeVersions.delete(source);
  return null;
}

export function unmarkImageCacheCapturing(state: RenderState): void {
  _capturingStates.delete(state);
}
