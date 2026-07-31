import type {
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTextureEntry,
  CanvasRenderTextureExplanation,
  RenderTexture,
} from '@flighthq/types/contract';

import { getCanvasRenderCacheScreenState } from './canvasCache';
import {
  beginCanvasRenderPass,
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  endCanvasRenderPass,
  resizeCanvasRenderTarget,
} from './canvasRenderTarget';

// Returns a populated render texture's state-owned canvas without copying pixels.
export function bindCanvasRenderTexture(
  state: CanvasRenderState,
  renderTexture: Readonly<RenderTexture>,
): HTMLCanvasElement | null {
  const entry = getEntry(state, renderTexture);
  return entry?.status === 'ready' ? entry.target.canvas : null;
}

export function destroyCanvasRenderTexture(state: CanvasRenderState, renderTexture: Readonly<RenderTexture>): void {
  const targets = getTargets(getCanvasRenderCacheScreenState(state));
  const entry = targets.get(renderTexture);
  if (entry === undefined) return;
  destroyCanvasRenderTarget(entry.target);
  targets.delete(renderTexture);
}

export function explainCanvasRenderTexture(
  state: CanvasRenderState,
  renderTexture: Readonly<RenderTexture>,
): CanvasRenderTextureExplanation {
  const entry = getEntry(state, renderTexture);
  return {
    height: entry?.target.height ?? renderTexture.source.height,
    status: entry?.status ?? 'unrendered',
    width: entry?.target.width ?? renderTexture.source.width,
  };
}

// Resolves the hidden target only while its public handle owns completed content. Effect recipes use
// this bridge; display composition continues to resolve the RenderTexture through the Sprite path.
export function getCanvasRenderTextureTarget(
  state: CanvasRenderState,
  renderTexture: Readonly<RenderTexture>,
): Readonly<CanvasRenderTarget> | null {
  const entry = getEntry(state, renderTexture);
  return entry?.status === 'ready' ? entry.target : null;
}

export function invalidateCanvasRenderTexture(
  state: CanvasRenderState,
  renderTexture: Readonly<RenderTexture>,
  status: 'released' | 'unrendered' = 'unrendered',
): void {
  const entry = getEntry(state, renderTexture);
  if (entry !== undefined) entry.status = status;
}

export function isCanvasRenderTextureReady(state: CanvasRenderState, renderTexture: Readonly<RenderTexture>): boolean {
  return getEntry(state, renderTexture)?.status === 'ready';
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
  writeCanvasRenderTextureTarget(state, renderTexture, (target) => {
    beginCanvasRenderPass(state, target);
    try {
      callback(state);
    } finally {
      endCanvasRenderPass(state);
    }
  });
}

// Gives an effect recipe the hidden destination without redirecting the render state. Success
// publishes the handle atomically; failure leaves it honestly unrendered.
export function writeCanvasRenderTextureTarget<T>(
  state: CanvasRenderState,
  renderTexture: RenderTexture,
  callback: (target: CanvasRenderTarget) => T,
): T {
  const entry = ensureEntry(state, renderTexture);
  const previousStatus = entry.status;
  entry.status = 'writing';
  let rendered = false;
  try {
    const result = callback(entry.target);
    rendered = true;
    return result;
  } finally {
    entry.status = rendered ? 'ready' : previousStatus === 'writing' ? 'writing' : 'unrendered';
    if (rendered) renderTexture.version = (renderTexture.version + 1) >>> 0;
  }
}

function ensureEntry(state: CanvasRenderState, renderTexture: Readonly<RenderTexture>): CanvasRenderTextureEntry {
  const descriptor = renderTexture.source;
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

function getEntry(
  state: CanvasRenderState,
  renderTexture: Readonly<RenderTexture>,
): CanvasRenderTextureEntry | undefined {
  return getTargets(getCanvasRenderCacheScreenState(state)).get(renderTexture);
}

const _targetsByState = new WeakMap<CanvasRenderState, WeakMap<RenderTexture, CanvasRenderTextureEntry>>();
