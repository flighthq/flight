import { createEntity } from '@flighthq/entity';
import { createMatrix, multiplyMatrix } from '@flighthq/geometry';
import { noopRendererData, registerRenderer } from '@flighthq/render';
import { createSignal } from '@flighthq/signals';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RenderState,
  WebGLCache,
  WebGLCacheAdapter,
  WebGLRenderState,
} from '@flighthq/types';
import { WebGLCacheKind } from '@flighthq/types';

import { drawWebGLRenderTargetResult } from './webglRenderTarget';

export { WebGLCacheKind };
export type { WebGLCache, WebGLCacheAdapter };

export function createWebGLCache(): WebGLCache {
  return createEntity({ kind: WebGLCacheKind, target: null, transform: createMatrix() });
}

export function createWebGLCacheAdapter(): WebGLCacheAdapter {
  const adapter: WebGLCacheAdapter = {
    primitive: null,
    signals: null,

    adapt(_state, _source, node) {
      adapter.signals?.onPrepare.emit();
      if (adapter.primitive === null) return null;
      node.source = adapter.primitive;
      node.kind = WebGLCacheKind;
      multiplyMatrix(node.transform2D, node.transform2D, adapter.primitive.transform);
      return false;
    },
  };
  return adapter;
}

export function enableWebGLCache(state: RenderState): void {
  registerRenderer(state, WebGLCacheKind, defaultWebGLCacheRenderer);
}

export function enableWebGLCacheAdapterSignals(adapter: WebGLCacheAdapter): void {
  adapter.signals ??= { onPrepare: createSignal() };
}

function drawWebGLCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source as WebGLCache;
  if (source.target === null) return;
  drawWebGLRenderTargetResult(state as WebGLRenderState, renderNode, source.target, source.transform);
}

export const defaultWebGLCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawWebGLCache,
};
