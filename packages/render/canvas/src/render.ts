import { getRenderNode, updateRenderableTree } from '@flighthq/render-core';
import type { CanvasRendererState, Renderable, RenderNode } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { renderBitmap } from './bitmap';
import { updateCacheBitmap } from './cacheBitmap';
import { popClipRect, pushClipRect } from './clipping';
import { renderOpaqueBackground } from './displayObject';
import { popMask, pushMask } from './masks';
import { setBlendMode } from './materials';

export function clear(state: CanvasRendererState): void {
  const cacheBlendMode = state.currentBlendMode;
  state.currentBlendMode = null;
  setBlendMode(state, BlendMode.Normal);

  state.context.setTransform(1, 0, 0, 1, 0, 0);
  state.context.globalAlpha = 1;

  if ((state.backgroundColor & 0xff) !== 0) {
    state.context.fillStyle = state.backgroundColorString;
    state.context.fillRect(0, 0, state.canvas.width, state.canvas.height);
  } else {
    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }

  setBlendMode(state, cacheBlendMode);
}

// export function finishClipAfterRender(state: CanvasRendererState) {
//   while (state.currentMaskDepth > 0) {
//     popMask(state);
//   }
//   while (state.currentScrollRectDepth > 0) {
//     popScrollRect(state);
//   }
// }

// export function flushRenderQueue(state: CanvasRendererState): void {
//   const currentQueue = state.currentQueue;
//   const currentQueueLength = state.currentQueueLength;
//   state.currentScrollRectDepth = 0;
//   state.currentMaskDepth = 0;
//   for (let i = 0; i < currentQueueLength; i++) {
//     const data = currentQueue[i];
//     renderObject(state, data);
//   }
//   finishClipAfterRender(state);
// }

function popMaskObject(state: CanvasRendererState, data: RenderNode, handleScrollRect: boolean = true): void {
  const source = data.source;

  if (source.mask !== null) {
    popMask(state);
  }

  if (handleScrollRect && source.scrollRect !== null) {
    popClipRect(state);
  }
}

function pushMaskObject(state: CanvasRendererState, data: RenderNode, handleScrollRect: boolean = true): void {
  const source = data.source;

  if (handleScrollRect && source.scrollRect != null) {
    pushClipRect(state, source.scrollRect, data.transform);
  }

  if (source.mask !== null) {
    pushMask(state, getRenderNode(state, source.mask));
  }
}

export function render(state: CanvasRendererState, source: Renderable): void {
  const dirty = updateRenderableTree(state, source);
  if (!dirty) return;

  clear(state);

  const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  // Start with root
  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength];
    const data = getRenderNode(state, current);

    const isMask = data.isMaskFrameID === currentFrameID;
    if (isMask) continue; // skip drawing masks (they're used for clipping elsewhere)

    const shouldRender = data.visible && data.alpha > 0 && !(data.transform.a === 0 && data.transform.d === 0);
    if (!shouldRender) continue;

    // ── Draw current object first (pre-order) ──
    renderObject(state, data);

    // Then push children in forward order (so we pop & draw index 0 first)
    if (current.children !== null) {
      // Push from last to first → pop gives index 0 first
      for (let i = current.children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = current.children[i];
      }
    }
  }
}

export function renderObject(state: CanvasRendererState, data: RenderNode): void {
  pushMaskObject(state, data);
  // updateClipBeforeRender(state, data);
  if (state.allowCacheAsBitmap) {
    updateCacheBitmap(state, data);
    if (data.cacheBitmap !== null) {
      renderBitmap(state, data.cacheBitmap);
      return;
    }
  }
  const source = data.source;
  renderOpaqueBackground(state, data);
  switch (source.type) {
    case 'bitmap':
      renderBitmap(state, data);
      break;
    // case 'richtext':
    //   renderRichText(state, data);
    //   break;
    // case 'shape':
    //   renderShape(state, data);
    //   break;
    // case 'tilemap':
    //   renderTilemap(state, data);
    //   break;
    // case 'video':
    //   renderVideo(state, data);
    //   break;
    default:
  }
  popMaskObject(state, data);
}

// export function updateClipBeforeRender(state: CanvasRendererState, data: RenderNode): void {
//   const { currentScrollRectDepth, currentMaskDepth } = state;
//   const { scrollRectDepth, source, maskDepth } = data;
//   const scrollRect = source.scrollRect;
//   const mask = source.mask;
//   const hasScrollRect = scrollRect != null;
//   const hasMask = mask != null;

//   if (scrollRectDepth > 0 && (scrollRectDepth < currentScrollRectDepth || hasScrollRect)) {
//     popScrollRect(state);
//   }

//   if (maskDepth > 0 && (maskDepth < currentMaskDepth || hasMask)) {
//     popMask(state);
//   }

//   if (hasMask) {
//     pushMask(state, data);
//   }

//   if (hasScrollRect) {
//     pushScrollRect(state, data);
//   }
// }
