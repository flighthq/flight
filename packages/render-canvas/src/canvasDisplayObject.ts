import { rectangle } from '@flighthq/geometry';
import { createNullRendererData, getDisplayObjectRenderNode } from '@flighthq/render-core';
import { calculateBoundsRect } from '@flighthq/scenegraph-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';

import { drawCanvasBitmap } from './canvasBitmap';
import { updateCanvasCacheBitmap } from './canvasCacheAsBitmap';
import { popCanvasClipRect, pushCanvasClipRect } from './canvasClipRect';
import { applyCanvasMask, popCanvasMask, pushCanvasMask } from './canvasMask';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasDisplayObject(state: CanvasRenderState, displayObject: DisplayObjectRenderNode): void {
  const opaqueBackground = displayObject.source.opaqueBackground;
  if (opaqueBackground === null) return;

  setCanvasBlendMode(state, displayObject.blendMode);

  const context = state.context;

  setCanvasTransform(state, context, displayObject.transform2D);

  const r = (opaqueBackground >> 16) & 0xff;
  const g = (opaqueBackground >> 8) & 0xff;
  const b = opaqueBackground & 0xff;
  context.fillStyle = `rgb(${r},${g},${b})`;

  // getLocalBoundsRect does not include children
  calculateBoundsRect(tempBounds, displayObject.source, displayObject.source);
  context.fillRect(0, 0, tempBounds.width, tempBounds.height);
}

export function drawCanvasDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  const source = data.source;
  if (source.opaqueBackground !== null) {
    calculateBoundsRect(tempBounds, source, source);
    state.context.rect(0, 0, tempBounds.width, tempBounds.width);
  } else {
    const children = getDisplayObjectRuntime(source).children;
    if (children !== null) {
      for (let i = 0; i < children.length; i++) {
        const data = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
        applyCanvasMask(state, data);
      }
    }
  }
}

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  // Start with root
  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    const data = getDisplayObjectRenderNode(state, current);

    const isMask = data.isMaskFrameID === currentFrameID;
    if (isMask) continue; // skip drawing masks (they're used for clipping elsewhere)

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    // ── Draw current object first (pre-order) ──
    drawObject(state, data);

    // Then push children in forward order (so we pop & draw index 0 first)
    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      // Push from last to first → pop gives index 0 first
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as DisplayObject;
      }
    }
  }
}

function drawObject(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  if (data.renderer === null) return;
  pushMaskObject(state, data);
  if (state.allowCacheAsBitmap) {
    updateCanvasCacheBitmap(state, data);
    if (data.cacheBitmap !== null) {
      drawCanvasBitmap(state, data.cacheBitmap);
      return;
    }
  }
  data.renderer.draw(state, data);
  popMaskObject(state, data);
}

function popMaskObject(
  state: CanvasRenderState,
  data: DisplayObjectRenderNode,
  handleScrollRect: boolean = true,
): void {
  const source = data.source;

  if (source.mask !== null) {
    popCanvasMask(state);
  }

  if (handleScrollRect && source.scrollRect !== null) {
    popCanvasClipRect(state);
  }
}

function pushMaskObject(
  state: CanvasRenderState,
  data: DisplayObjectRenderNode,
  handleScrollRect: boolean = true,
): void {
  const source = data.source;

  if (handleScrollRect && source.scrollRect != null) {
    pushCanvasClipRect(state, source.scrollRect, data.transform2D);
  }

  if (source.mask !== null) {
    pushCanvasMask(state, getDisplayObjectRenderNode(state, source.mask));
  }
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
  drawMask: drawCanvasDisplayObjectMask,
};

const tempBounds = rectangle.create();
