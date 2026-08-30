import { getRenderProxyCache, noopRendererData, registerRenderCacheRenderer } from '@flighthq/render/contract';
import {
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  resizeCanvasRenderTarget,
} from '@flighthq/scene2d-canvas/contract';
import type {
  CanvasRenderTarget,
  CanvasRenderSurfaceCreator,
  Scene2DRenderer,
  DomRenderState,
  RenderCache,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types/contract';

import { prepareDomElement, setDomRendererElement } from './domStyle';
import { setDomTransformWithOffset } from './domTransform';

export function enableDomRenderCache(state: RenderState): void {
  registerRenderCacheRenderer(state, defaultDomRenderCacheRenderer);
}

/**
 * Allocates or resizes the canvas the DOM backend places for `cache`, returning it so a caller
 * can draw the cached content into `target.context`. DOM cannot rasterize a scene graph itself,
 * so its cache is always custom-baked: render the subtree into this canvas with a canvas render
 * pass (or draw any content), set the handle's transform, and the DOM renderer places the canvas
 * element. The returned canvas is pre-styled for DOM placement.
 */
export function ensureDomRenderCacheTarget(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  state: DomRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): CanvasRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createCanvasRenderTarget(creator, width, height);
    prepareDomElement(target.canvas);
    targets.set(cache, target);
  } else {
    resizeCanvasRenderTarget(target, width, height);
  }
  return target;
}

export function getDomRenderCacheTarget(state: DomRenderState, cache: RenderCache): CanvasRenderTarget | null {
  return getTargets(state).get(cache) ?? null;
}

export function releaseDomRenderCache(state: DomRenderState, cache: RenderCache): void {
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target === undefined) return;
  targets.delete(cache);
  destroyCanvasRenderTarget(target);
}

function drawDomRenderCache(state: RenderState, data: RenderProxy2D): void {
  const cache = getRenderProxyCache(state, data.source);
  if (cache === null) return;
  const domState = state as DomRenderState;
  const target = getTargets(domState).get(cache);
  if (target === undefined) return;

  const canvas = target.canvas;
  setDomTransformWithOffset(canvas, data.transform2D, 0, 0, domState.roundPixels);
  canvas.style.opacity = data.alpha < 1 ? String(data.alpha) : '';
  canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  domState.applyBlendMode?.(canvas, data.blendMode);
  setDomRendererElement(domState, canvas);
}

function getTargets(state: DomRenderState): Map<RenderCache, CanvasRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new Map();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultDomRenderCacheRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawDomRenderCache,
};

// The screen state owns each cache's target canvas, keyed by the handle.
const _renderCacheTargets = new WeakMap<DomRenderState, Map<RenderCache, CanvasRenderTarget>>();
