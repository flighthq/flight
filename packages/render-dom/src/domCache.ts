import { getRenderNodeCache, noopRendererData, registerRenderCacheRenderer } from '@flighthq/render';
import { createCanvasRenderTarget, resizeCanvasRenderTarget } from '@flighthq/render-canvas';
import type {
  CanvasRenderTarget,
  DisplayObjectRenderer,
  DOMRenderState,
  RenderCache,
  RenderNode2D,
  RenderState,
} from '@flighthq/types';

import { prepareDOMElement, setDOMRendererElement } from './domStyle';
import { setDOMTransformWithOffset } from './domTransform';

export function enableDOMRenderCache(state: RenderState): void {
  registerRenderCacheRenderer(state, defaultDOMRenderCacheRenderer);
}

/**
 * Allocates or resizes the canvas the DOM backend places for `cache`, returning it so a caller
 * can draw the cached content into `target.context`. DOM cannot rasterize a scene graph itself,
 * so its cache is always custom-baked: render the subtree into this canvas with a canvas render
 * pass (or draw any content), set the handle's transform, and the DOM renderer places the canvas
 * element. The returned canvas is pre-styled for DOM placement.
 */
export function ensureDOMRenderCacheTarget(
  state: DOMRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): CanvasRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createCanvasRenderTarget(width, height);
    prepareDOMElement(target.canvas);
    targets.set(cache, target);
  } else {
    resizeCanvasRenderTarget(target, width, height);
  }
  return target;
}

export function getDOMRenderCacheTarget(state: DOMRenderState, cache: RenderCache): CanvasRenderTarget | null {
  return getTargets(state).get(cache) ?? null;
}

export function releaseDOMRenderCache(state: DOMRenderState, cache: RenderCache): void {
  // The target canvas is a DOM element with no GPU handle; dropping the reference frees it.
  getTargets(state).delete(cache);
}

function drawDOMRenderCache(state: RenderState, data: RenderNode2D): void {
  const cache = getRenderNodeCache(state, data.source);
  if (cache === null) return;
  const domState = state as DOMRenderState;
  const target = getTargets(domState).get(cache);
  if (target === undefined) return;

  const canvas = target.canvas;
  setDOMTransformWithOffset(canvas, data.transform2D, 0, 0, domState.roundPixels);
  canvas.style.opacity = data.alpha < 1 ? String(data.alpha) : '';
  canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  domState.applyBlendMode?.(canvas, data.blendMode);
  setDOMRendererElement(domState, canvas);
}

function getTargets(state: DOMRenderState): WeakMap<RenderCache, CanvasRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultDOMRenderCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawDOMRenderCache,
};

// The screen state owns each cache's target canvas, keyed by the handle.
const _renderCacheTargets = new WeakMap<DOMRenderState, WeakMap<RenderCache, CanvasRenderTarget>>();
