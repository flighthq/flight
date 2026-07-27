import { createMatrix } from '@flighthq/geometry/contract';
import {
  beginGlRenderPass,
  createGlRenderTarget,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  endGlRenderPass,
  popGlRenderState,
  pushGlRenderState,
  resizeGlRenderTarget,
} from '@flighthq/render-gl/contract';
import { noopRendererData, registerRenderer } from '@flighthq/render/contract';
import type {
  GlRenderState,
  GlRenderTarget,
  RenderProxy2D,
  RenderTargetNode2D,
  Scene2DRenderer,
} from '@flighthq/types/contract';
import { RenderTargetNode2DKind } from '@flighthq/types/contract';

import { getGlRenderCacheScreenState } from './glCache';
import { flushGlSpriteBatch } from './glSpriteBatch';

export const defaultGlRenderTargetNode2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawGlRenderTargetNode2D,
};

export function destroyGlRenderTargetNode2D(state: GlRenderState, node: RenderTargetNode2D): void {
  const screenState = getGlRenderCacheScreenState(state);
  const targets = getTargets(screenState);
  const target = targets.get(node);
  if (target === undefined) return;
  destroyGlRenderTarget(screenState, target);
  targets.delete(node);
}

export function enableGlRenderTargetNode2D(state: GlRenderState): void {
  registerRenderer(state, RenderTargetNode2DKind, defaultGlRenderTargetNode2DRenderer);
}

/**
 * Clears and populates `node`'s hidden GL render target. The callback is synchronous and may issue
 * foreign rendering commands such as drawGlScene3D; GL and render-pass state are restored even when
 * it throws. The populated target is composited later when the 2D render walk reaches the node.
 */
export function renderIntoGlRenderTargetNode2D(
  state: GlRenderState,
  node: RenderTargetNode2D,
  callback: (state: GlRenderState) => void,
): void {
  const target = ensureTarget(state, node);
  pushGlRenderState(state);
  try {
    beginGlRenderPass(state, target);
    try {
      callback(state);
    } finally {
      endGlRenderPass(state);
    }
  } finally {
    popGlRenderState(state);
  }
}

function drawGlRenderTargetNode2D(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const target = getTargets(getGlRenderCacheScreenState(state)).get(renderProxy.source as RenderTargetNode2D);
  if (target === undefined) return;
  flushGlSpriteBatch(state);
  drawGlRenderTargetResult(state, renderProxy, target, _identity);
}

function ensureTarget(state: GlRenderState, node: RenderTargetNode2D): GlRenderTarget {
  const targets = getTargets(getGlRenderCacheScreenState(state));
  let target = targets.get(node);
  if (target === undefined) {
    target = createGlRenderTarget(state, {
      depth: node.data.depth ? 'depth-stencil' : 'none',
      height: node.data.height,
      width: node.data.width,
    });
    targets.set(node, target);
  } else {
    resizeGlRenderTarget(state, target, node.data.width, node.data.height);
  }
  return target;
}

function getTargets(state: GlRenderState): WeakMap<RenderTargetNode2D, GlRenderTarget> {
  let targets = _targetsByState.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _targetsByState.set(state, targets);
  }
  return targets;
}

// Each GL state owns resources for its context; the scene node remains backend-neutral.
const _targetsByState = new WeakMap<GlRenderState, WeakMap<RenderTargetNode2D, GlRenderTarget>>();
const _identity = createMatrix();
