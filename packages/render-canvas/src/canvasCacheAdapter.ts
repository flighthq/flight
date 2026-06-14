import { createEntity } from '@flighthq/entity';
import { createMatrix, multiplyMatrix } from '@flighthq/geometry';
import { noopRendererData, registerRenderer } from '@flighthq/render';
import { createSignal } from '@flighthq/signals';
import type {
  CanvasCache,
  CanvasCacheAdapter,
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RenderState,
} from '@flighthq/types';
import { CanvasCacheKind } from '@flighthq/types';

import { createCanvasRenderTarget, resizeCanvasRenderTarget } from './canvasRenderTarget';
import { setCanvasTransform } from './canvasTransform';

export { CanvasCacheKind };
export type { CanvasCache, CanvasCacheAdapter };

export function createCanvasCache(): CanvasCache {
  return createEntity({ kind: CanvasCacheKind, target: null, transform: createMatrix() });
}

export function createCanvasCacheAdapter(): CanvasCacheAdapter {
  const adapter: CanvasCacheAdapter = {
    primitive: null,
    signals: null,

    adapt(_state, _source, node) {
      adapter.signals?.onPrepare.emit();
      if (adapter.primitive === null) return null;
      node.source = adapter.primitive;
      node.kind = CanvasCacheKind;
      multiplyMatrix(node.transform2D, node.transform2D, adapter.primitive.transform);
      return false;
    },
  };
  return adapter;
}

export function enableCanvasCache(state: RenderState): void {
  registerRenderer(state, CanvasCacheKind, defaultCanvasCacheRenderer);
}

export function enableCanvasCacheAdapterSignals(adapter: CanvasCacheAdapter): void {
  adapter.signals ??= { onPrepare: createSignal() };
}

export function ensureCanvasCacheSize(cache: CanvasCache, minWidth: number, minHeight: number): boolean {
  const current = cache.target;
  if (current !== null && current.width >= minWidth && current.height >= minHeight) return false;
  const newWidth = current !== null ? Math.max(current.width, minWidth) : minWidth;
  const newHeight = current !== null ? Math.max(current.height, minHeight) : minHeight;
  resizeCanvasCache(cache, newWidth, newHeight);
  return true;
}

export function resizeCanvasCache(cache: CanvasCache, width: number, height: number): void {
  if (cache.target === null) {
    cache.target = createCanvasRenderTarget(width, height);
  } else {
    resizeCanvasRenderTarget(cache.target, width, height);
  }
}

function drawCanvasCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source as CanvasCache;
  if (source.target === null) return;
  const canvasState = state as CanvasRenderState;
  setCanvasTransform(canvasState, canvasState.context, renderNode.transform2D);
  canvasState.context.drawImage(source.target.canvas, 0, 0);
}

export const defaultCanvasCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawCanvasCache,
};
