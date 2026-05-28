import { createNullRendererData, getDisplayObjectRenderNode } from '@flighthq/render-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';

import { drawImageCacheResult } from './canvasCacheAsBitmap';
import { popCanvasClipRect, pushCanvasClipRect } from './canvasClipRect';
import { applyCanvasMask, popCanvasMask, pushCanvasMask } from './canvasMask';

export function drawCanvasDisplayObject(_state: CanvasRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawCanvasDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  const children = getDisplayObjectRuntime(data.source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
      applyCanvasMask(state, child);
    }
  }
}

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    const data = getDisplayObjectRenderNode(state, current);

    const isMask = data.isMaskFrameID === currentFrameID;
    if (isMask) continue;

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    drawObject(state, data);

    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as DisplayObject;
      }
    }
  }
}

function drawObject(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  if (data.renderer === null) return;
  pushMaskObject(state, data);
  const cache = getDisplayObjectRuntime(data.source).imageCache;
  if (cache !== null && cache.canvas !== null) {
    drawImageCacheResult(state, data, cache);
    popMaskObject(state, data);
    return;
  }
  data.renderer.draw(state, data);
  popMaskObject(state, data);
}

function popMaskObject(state: CanvasRenderState, data: DisplayObjectRenderNode, handleScrollRect: boolean = true): void {
  const source = data.source;
  if (source.mask !== null) popCanvasMask(state);
  if (handleScrollRect && source.scrollRect !== null) popCanvasClipRect(state);
}

function pushMaskObject(state: CanvasRenderState, data: DisplayObjectRenderNode, handleScrollRect: boolean = true): void {
  const source = data.source;
  if (handleScrollRect && source.scrollRect != null) pushCanvasClipRect(state, source.scrollRect, data.transform2D);
  if (source.mask !== null) pushCanvasMask(state, getDisplayObjectRenderNode(state, source.mask));
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
  drawMask: drawCanvasDisplayObjectMask,
};
