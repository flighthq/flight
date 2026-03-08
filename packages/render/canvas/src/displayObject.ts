import { rectangle } from '@flighthq/geometry';
import { createNullRendererData, getDisplayObjectRenderNode, setRenderer } from '@flighthq/render-core';
import { calculateBoundsRect } from '@flighthq/scene-graph-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { drawBitmap } from './bitmap';
import { updateCacheBitmap } from './cacheBitmap';
import { popClipRect, pushClipRect } from './clipping';
import { applyMask, popMask, pushMask } from './masks';
import { setBlendMode } from './materials';
import { setTransform } from './transform';

export function drawDisplayObject(state: CanvasRenderState, displayObject: DisplayObjectRenderNode): void {
  const opaqueBackground = displayObject.source.opaqueBackground;
  if (opaqueBackground === null) return;

  setBlendMode(state, displayObject.blendMode);

  const context = state.context;

  setTransform(state, context, displayObject.transform);

  const r = (opaqueBackground >> 16) & 0xff;
  const g = (opaqueBackground >> 8) & 0xff;
  const b = opaqueBackground & 0xff;
  context.fillStyle = `rgb(${r},${g},${b})`;

  // getLocalBoundsRect does not include children
  calculateBoundsRect(tempBounds, displayObject.source, displayObject.source);
  context.fillRect(0, 0, tempBounds.width, tempBounds.height);
}

export function drawDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  const source = data.source;
  if (source.opaqueBackground !== null) {
    calculateBoundsRect(tempBounds, source, source);
    state.context.rect(0, 0, tempBounds.width, tempBounds.width);
  } else {
    const children = source.children;
    if (children !== null) {
      for (let i = 0; i < children.length; i++) {
        const data = getDisplayObjectRenderNode(state, children[i]);
        applyMask(state, data);
      }
    }
  }
}

export function renderDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
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

    const shouldRender = data.visible && data.alpha > 0 && (data.transform.a !== 0 || data.transform.d !== 0);
    if (!shouldRender) continue;

    // ── Draw current object first (pre-order) ──
    drawObject(state, data);

    // Then push children in forward order (so we pop & draw index 0 first)
    if (current.children !== null) {
      // Push from last to first → pop gives index 0 first
      for (let i = current.children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = current.children[i];
      }
    }
  }
}

export function setDisplayObjectRenderer(
  state: CanvasRenderState,
  renderer: DisplayObjectRenderer = defaultDisplayObjectRenderer,
): void {
  setRenderer(state, DisplayObjectKind, renderer);
}

function drawObject(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  if (data.renderer === null) return;
  pushMaskObject(state, data);
  if (state.allowCacheAsBitmap) {
    updateCacheBitmap(state, data);
    if (data.cacheBitmap !== null) {
      drawBitmap(state, data.cacheBitmap);
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
    popMask(state);
  }

  if (handleScrollRect && source.scrollRect !== null) {
    popClipRect(state);
  }
}

function pushMaskObject(
  state: CanvasRenderState,
  data: DisplayObjectRenderNode,
  handleScrollRect: boolean = true,
): void {
  const source = data.source;

  if (handleScrollRect && source.scrollRect != null) {
    pushClipRect(state, source.scrollRect, data.transform);
  }

  if (source.mask !== null) {
    pushMask(state, getDisplayObjectRenderNode(state, source.mask));
  }
}

export const defaultDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawDisplayObject,
  drawMask: drawDisplayObjectMask,
};

const tempBounds = rectangle.create();
