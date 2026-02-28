import { prepareRenderQueue, updateRenderableTree } from '@flighthq/render-core';
import type { CanvasRendererState, Renderable, RenderableData } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { updateCacheBitmap } from './cacheBitmap';
import { popScrollRect, pushScrollRect } from './clipping';
import { popMask, pushMask } from './masks';
import { setBlendMode } from './materials';
import { renderBitmap } from './type/bitmap';
import { renderOpaqueBackground } from './type/displayObject';

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

export function finishClipAfterRender(state: CanvasRendererState) {
  while (state.currentMaskDepth > 0) {
    popMask(state);
  }
  while (state.currentScrollRectDepth > 0) {
    popScrollRect(state);
  }
}

export function flushRenderQueue(state: CanvasRendererState): void {
  const currentQueue = state.currentQueue;
  const currentQueueLength = state.currentQueueLength;
  state.currentScrollRectDepth = 0;
  state.currentMaskDepth = 0;
  for (let i = 0; i < currentQueueLength; i++) {
    const data = currentQueue[i];
    renderObject(state, data);
  }
  finishClipAfterRender(state);
}

export function render(state: CanvasRendererState, source: Renderable): void {
  const dirty = updateRenderableTree(state, source);
  if (dirty) {
    prepareRenderQueue(state, source);
    clear(state);
    flushRenderQueue(state);
  }
}

export function renderObject(state: CanvasRendererState, data: RenderableData): void {
  updateClipBeforeRender(state, data);
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
}

export function updateClipBeforeRender(state: CanvasRendererState, data: RenderableData): void {
  const { currentScrollRectDepth, currentMaskDepth } = state;
  const { scrollRectDepth, source, maskDepth } = data;
  const scrollRect = source.scrollRect;
  const mask = source.mask;
  const hasScrollRect = scrollRect != null;
  const hasMask = mask != null;

  if (scrollRectDepth > 0 && (scrollRectDepth < currentScrollRectDepth || hasScrollRect)) {
    popScrollRect(state);
  }

  if (maskDepth > 0 && (maskDepth < currentMaskDepth || hasMask)) {
    popMask(state);
  }

  if (hasMask) {
    pushMask(state, data);
  }

  if (hasScrollRect) {
    pushScrollRect(state, data);
  }
}
