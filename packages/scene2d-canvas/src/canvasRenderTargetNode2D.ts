import { noopRendererData, registerRenderer } from '@flighthq/render/contract';
import type {
  CanvasRenderState,
  CanvasRenderTarget,
  RenderProxy2D,
  RenderTargetNode2D,
  Scene2DRenderer,
} from '@flighthq/types/contract';
import { RenderTargetNode2DKind } from '@flighthq/types/contract';

import { getCanvasRenderCacheScreenState } from './canvasCache';
import {
  beginCanvasRenderPass,
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  endCanvasRenderPass,
  resizeCanvasRenderTarget,
} from './canvasRenderTarget';
import { setCanvasTransform } from './canvasTransform';

export const defaultCanvasRenderTargetNode2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawCanvasRenderTargetNode2D,
};

export function destroyCanvasRenderTargetNode2D(state: CanvasRenderState, node: RenderTargetNode2D): void {
  const screenState = getCanvasRenderCacheScreenState(state);
  const targets = getTargets(screenState);
  const target = targets.get(node);
  if (target === undefined) return;
  destroyCanvasRenderTarget(target);
  targets.delete(node);
}

export function enableCanvasRenderTargetNode2D(state: CanvasRenderState): void {
  registerRenderer(state, RenderTargetNode2DKind, defaultCanvasRenderTargetNode2DRenderer);
}

/**
 * Clears and populates `node`'s hidden Canvas render target. The callback is synchronous and draws
 * through the supplied state's redirected offscreen context. The populated target is composited
 * later when the 2D render walk reaches the node.
 */
export function renderIntoCanvasRenderTargetNode2D(
  state: CanvasRenderState,
  node: RenderTargetNode2D,
  callback: (state: CanvasRenderState) => void,
): void {
  const target = ensureTarget(state, node);
  beginCanvasRenderPass(state, target);
  try {
    callback(state);
  } finally {
    endCanvasRenderPass(state);
  }
}

function drawCanvasRenderTargetNode2D(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  const target = getTargets(getCanvasRenderCacheScreenState(state)).get(renderProxy.source as RenderTargetNode2D);
  if (target === undefined) return;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  state.context.globalAlpha = renderProxy.alpha;
  setCanvasTransform(state, state.context, renderProxy.transform2D);
  state.context.drawImage(target.canvas, 0, 0);
}

function ensureTarget(state: CanvasRenderState, node: RenderTargetNode2D): CanvasRenderTarget {
  const targets = getTargets(getCanvasRenderCacheScreenState(state));
  let target = targets.get(node);
  if (target === undefined) {
    target = createCanvasRenderTarget(node.data.width, node.data.height);
    targets.set(node, target);
  } else {
    resizeCanvasRenderTarget(target, node.data.width, node.data.height);
  }
  return target;
}

function getTargets(state: CanvasRenderState): WeakMap<RenderTargetNode2D, CanvasRenderTarget> {
  let targets = _targetsByState.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _targetsByState.set(state, targets);
  }
  return targets;
}

// Each screen state owns the target backing for its backend-neutral scene nodes.
const _targetsByState = new WeakMap<CanvasRenderState, WeakMap<RenderTargetNode2D, CanvasRenderTarget>>();
