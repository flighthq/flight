import type { CanvasRenderState, CanvasRenderTarget, RenderTexture } from '@flighthq/types/contract';

import { getCanvasRenderCacheScreenState } from './canvasCache';
import {
  beginCanvasRenderPass,
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  endCanvasRenderPass,
  resizeCanvasRenderTarget,
} from './canvasRenderTarget';

interface CanvasRenderTextureEntry {
  status: 'unrendered' | 'writing' | 'ready';
  target: CanvasRenderTarget;
}

// Returns a populated render texture's state-owned canvas without copying pixels.
export function bindCanvasRenderTexture(
  state: CanvasRenderState,
  renderTexture: Readonly<RenderTexture>,
): HTMLCanvasElement | null {
  const entry = getTargets(getCanvasRenderCacheScreenState(state)).get(renderTexture);
  return entry?.status === 'ready' ? entry.target.canvas : null;
}

export function destroyCanvasRenderTexture(state: CanvasRenderState, renderTexture: Readonly<RenderTexture>): void {
  const targets = getTargets(getCanvasRenderCacheScreenState(state));
  const entry = targets.get(renderTexture);
  if (entry === undefined) return;
  destroyCanvasRenderTarget(entry.target);
  targets.delete(renderTexture);
}

/**
 * Clears and populates a render texture's hidden Canvas target. The callback is synchronous and
 * draws through the supplied state's redirected offscreen context.
 */
export function renderIntoCanvasRenderTexture(
  state: CanvasRenderState,
  renderTexture: RenderTexture,
  callback: (state: CanvasRenderState) => void,
): void {
  const entry = ensureEntry(state, renderTexture);
  entry.status = 'writing';
  let rendered = false;
  beginCanvasRenderPass(state, entry.target);
  try {
    callback(state);
    rendered = true;
  } finally {
    endCanvasRenderPass(state);
    entry.status = rendered ? 'ready' : 'unrendered';
    if (rendered) renderTexture.version = (renderTexture.version + 1) >>> 0;
  }
}

function ensureEntry(state: CanvasRenderState, renderTexture: Readonly<RenderTexture>): CanvasRenderTextureEntry {
  const descriptor = renderTexture.storage.target;
  const targets = getTargets(getCanvasRenderCacheScreenState(state));
  let entry = targets.get(renderTexture);
  if (entry === undefined) {
    entry = {
      status: 'unrendered',
      target: createCanvasRenderTarget(descriptor.width, descriptor.height),
    };
    targets.set(renderTexture, entry);
  } else {
    resizeCanvasRenderTarget(entry.target, descriptor.width, descriptor.height);
  }
  return entry;
}

function getTargets(state: CanvasRenderState): WeakMap<RenderTexture, CanvasRenderTextureEntry> {
  let targets = _targetsByState.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _targetsByState.set(state, targets);
  }
  return targets;
}

const _targetsByState = new WeakMap<CanvasRenderState, WeakMap<RenderTexture, CanvasRenderTextureEntry>>();
