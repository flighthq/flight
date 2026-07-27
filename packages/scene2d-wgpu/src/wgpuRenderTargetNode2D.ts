import { createMatrix } from '@flighthq/geometry/contract';
import {
  beginWgpuFrame,
  beginWgpuRenderPass,
  createWgpuRenderTarget,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  endWgpuRenderPass,
  getWgpuRenderStateRuntime,
  resizeWgpuRenderTarget,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import { noopRendererData, registerRenderer } from '@flighthq/render/contract';
import type {
  RenderProxy2D,
  RenderTargetNode2D,
  Scene2DRenderer,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuRenderTarget,
} from '@flighthq/types/contract';
import { RenderTargetNode2DKind } from '@flighthq/types/contract';

import { getWgpuRenderCacheScreenState } from './wgpuCache';
import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

export const defaultWgpuRenderTargetNode2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawWgpuRenderTargetNode2D,
};

export function destroyWgpuRenderTargetNode2D(state: WgpuRenderState, node: RenderTargetNode2D): void {
  const screenState = getWgpuRenderCacheScreenState(state);
  const targets = getTargets(screenState);
  const target = targets.get(node);
  if (target === undefined) return;
  destroyWgpuRenderTarget(screenState, target);
  targets.delete(node);
}

export function enableWgpuRenderTargetNode2D(state: WgpuRenderState): void {
  registerRenderer(state, RenderTargetNode2DKind, defaultWgpuRenderTargetNode2DRenderer);
}

/**
 * Clears and populates `node`'s hidden WebGPU render target. The callback records into the current
 * frame when one is active, or a standalone frame opened and submitted by this helper otherwise.
 * The populated target is composited later when the 2D render walk reaches the node.
 */
export function renderIntoWgpuRenderTargetNode2D(
  state: WgpuRenderState,
  node: RenderTargetNode2D,
  callback: (state: WgpuRenderState) => void,
): void {
  const screenState = getWgpuRenderCacheScreenState(state);
  const runtime = getWgpuRenderStateRuntime(state);
  const screenRuntime = getWgpuRenderStateRuntime(screenState);
  const ownsFrame = screenRuntime.commandEncoder === null;
  if (ownsFrame) beginWgpuFrame(screenState);
  syncWgpuRenderTargetNode2DState(runtime, screenRuntime);

  const target = ensureTarget(screenState, node);
  beginWgpuRenderPass(state, target);
  try {
    callback(state);
  } finally {
    endWgpuRenderPass(state);
    syncWgpuRenderTargetNode2DScreenState(screenRuntime, runtime);
    if (ownsFrame) submitWgpuRenderPass(screenState);
  }
}

function drawWgpuRenderTargetNode2D(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const target = getTargets(getWgpuRenderCacheScreenState(state)).get(renderProxy.source as RenderTargetNode2D);
  if (target === undefined) return;
  flushWgpuSpriteBatch(state);
  drawWgpuRenderTargetResult(state, renderProxy, target, _identity);
}

function ensureTarget(state: WgpuRenderState, node: RenderTargetNode2D): WgpuRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(node);
  if (target === undefined) {
    target = createWgpuRenderTarget(state, node.data.width, node.data.height);
    targets.set(node, target);
  } else {
    resizeWgpuRenderTarget(state, target, node.data.width, node.data.height);
  }
  return target;
}

function getTargets(state: WgpuRenderState): WeakMap<RenderTargetNode2D, WgpuRenderTarget> {
  let targets = _targetsByState.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _targetsByState.set(state, targets);
  }
  return targets;
}

function syncWgpuRenderTargetNode2DScreenState(
  screenRuntime: WgpuRenderStateRuntime,
  runtime: Readonly<WgpuRenderStateRuntime>,
): void {
  screenRuntime.commandEncoder = runtime.commandEncoder;
  screenRuntime.renderPass = runtime.renderPass;
  screenRuntime.canvasTextureView = runtime.canvasTextureView;
  screenRuntime.canvasViewCleared = runtime.canvasViewCleared;
  screenRuntime.currentBlendMode = null;
  screenRuntime.uniformOffset = runtime.uniformOffset;
}

function syncWgpuRenderTargetNode2DState(
  runtime: WgpuRenderStateRuntime,
  screenRuntime: Readonly<WgpuRenderStateRuntime>,
): void {
  runtime.commandEncoder = screenRuntime.commandEncoder;
  runtime.renderPass = screenRuntime.renderPass;
  runtime.canvasTextureView = screenRuntime.canvasTextureView;
  runtime.canvasViewCleared = screenRuntime.canvasViewCleared;
  runtime.depthStencilTexture = screenRuntime.depthStencilTexture;
  runtime.depthStencilView = screenRuntime.depthStencilView;
  runtime.depthStencilWidth = screenRuntime.depthStencilWidth;
  runtime.depthStencilHeight = screenRuntime.depthStencilHeight;
  runtime.uniformOffset = screenRuntime.uniformOffset;
}

// Each screen state owns the target backing for its backend-neutral scene nodes.
const _targetsByState = new WeakMap<WgpuRenderState, WeakMap<RenderTargetNode2D, WgpuRenderTarget>>();
const _identity = createMatrix();
