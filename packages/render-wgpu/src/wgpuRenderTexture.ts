import { resolveRenderTargetDescriptor } from '@flighthq/render/contract';
import type {
  RenderTexture,
  RenderTargetFormat,
  WgpuRenderState,
  WgpuRenderTextureEntry,
  WgpuRenderTextureExplanation,
  WgpuRenderTextureGuard,
  WgpuTextureEntry,
} from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  beginWgpuRenderPass,
  createWgpuRenderTarget,
  destroyWgpuRenderTarget,
  endWgpuRenderPass,
  resizeWgpuRenderTarget,
} from './wgpuRenderTarget';

// Returns a populated render texture's state-owned allocation without copying pixels through the
// CPU. An unrendered or currently-written Texture returns null.
export function bindWgpuRenderTexture(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
): WgpuTextureEntry | null {
  const entry = getWgpuRenderTextureEntry(state, renderTexture);
  if (entry?.status === 'ready') return entry.target;
  notifyGuard(state, renderTexture);
  return null;
}

export function destroyWgpuRenderTexture(state: WgpuRenderState, renderTexture: Readonly<RenderTexture>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const entry = runtime.context.wgpuRenderTextureCache?.get(renderTexture);
  if (entry === undefined) return;
  destroyWgpuRenderTarget(state, entry.target);
  runtime.context.wgpuRenderTextureCache!.delete(renderTexture);
}

export function explainWgpuRenderTexture(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
): WgpuRenderTextureExplanation {
  const entry = getWgpuRenderTextureEntry(state, renderTexture);
  return {
    height: entry?.target.height ?? renderTexture.source.height,
    status: entry?.status ?? 'unrendered',
    width: entry?.target.width ?? renderTexture.source.width,
  };
}

// Resolves the hidden target only while its public handle owns completed content. Effect recipes use
// this bridge; display composition continues to sample the RenderTexture.
export function getWgpuRenderTextureTarget(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
): Readonly<WgpuRenderTextureEntry['target']> | null {
  const entry = getWgpuRenderTextureEntry(state, renderTexture);
  if (entry?.status === 'ready') return entry.target;
  notifyGuard(state, renderTexture);
  return null;
}

export function invalidateWgpuRenderTexture(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
  status: 'released' | 'unrendered' = 'unrendered',
): void {
  const entry = getWgpuRenderTextureEntry(state, renderTexture);
  if (entry !== undefined) entry.status = status;
}

export function isWgpuRenderTextureReady(state: WgpuRenderState, renderTexture: Readonly<RenderTexture>): boolean {
  const ready = getWgpuRenderTextureEntry(state, renderTexture)?.status === 'ready';
  if (!ready) notifyGuard(state, renderTexture);
  return ready;
}

/**
 * Clears and populates a render texture's hidden WebGPU target. The caller must have opened the
 * frame command encoder; the enclosing render pass is restored even when the callback throws.
 */
export function renderIntoWgpuRenderTexture(
  state: WgpuRenderState,
  renderTexture: RenderTexture,
  callback: (state: WgpuRenderState) => void,
): void {
  writeWgpuRenderTextureTarget(state, renderTexture, (target) => {
    beginWgpuRenderPass(state, target);
    try {
      callback(state);
    } finally {
      endWgpuRenderPass(state);
    }
  });
}

export function setWgpuRenderTextureGuard(state: WgpuRenderState, guard: WgpuRenderTextureGuard | null): void {
  getWgpuRenderStateRuntime(state).wgpuRenderTextureGuard = guard;
}

// Gives a backend recipe the hidden destination without opening a render pass. The recipe may encode
// several passes; success atomically publishes the handle, while failure restores an honest status.
export function writeWgpuRenderTextureTarget<T>(
  state: WgpuRenderState,
  renderTexture: RenderTexture,
  callback: (target: WgpuRenderTextureEntry['target']) => T,
): T {
  const entry = ensureWgpuRenderTextureEntry(state, renderTexture);
  const previousStatus = entry.status;
  entry.status = 'writing';
  let rendered = false;
  try {
    const result = callback(entry.target);
    rendered = true;
    return result;
  } finally {
    entry.status = rendered ? 'ready' : previousStatus === 'writing' ? 'writing' : 'unrendered';
    if (rendered) {
      renderTexture.colorSpace = entry.target.colorSpace;
      renderTexture.version = (renderTexture.version + 1) >>> 0;
    }
  }
}

function ensureWgpuRenderTextureEntry(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
): WgpuRenderTextureEntry {
  const descriptor = renderTexture.source;
  const requested = resolveRenderTargetDescriptor(descriptor);
  const format = getWgpuRenderTextureFormat(state, requested.format);
  const colorSpace = descriptor.colorSpace ?? renderTexture.colorSpace;
  const runtime = getWgpuRenderStateRuntime(state);
  const entries = (runtime.context.wgpuRenderTextureCache ??= new WeakMap());
  let entry = entries.get(renderTexture);
  if (entry === undefined) {
    const target = createWgpuRenderTarget(
      state,
      requested.width,
      requested.height,
      format,
      colorSpace,
      requested.sampleCount,
    );
    target.clearColors = [...requested.clearColors];
    target.clearDepth = requested.clearDepth;
    entry = { status: 'unrendered', target };
    entries.set(renderTexture, entry);
  } else {
    if (entry.target.format !== format) {
      destroyWgpuRenderTarget(state, entry.target);
      entry.target = createWgpuRenderTarget(
        state,
        requested.width,
        requested.height,
        format,
        colorSpace,
        requested.sampleCount,
      );
      entry.status = 'unrendered';
    } else {
      resizeWgpuRenderTarget(state, entry.target, requested.width, requested.height, requested.sampleCount);
      entry.target.colorSpace = colorSpace;
    }
    entry.target.clearColors = [...requested.clearColors];
    entry.target.clearDepth = requested.clearDepth;
  }
  return entry;
}

function getWgpuRenderTextureEntry(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
): WgpuRenderTextureEntry | undefined {
  return getWgpuRenderStateRuntime(state).context.wgpuRenderTextureCache?.get(renderTexture);
}

function getWgpuRenderTextureFormat(state: WgpuRenderState, format: RenderTargetFormat | undefined): GPUTextureFormat {
  if (format === 'rgba16f') return 'rgba16float';
  if (format === 'rgba32f') return 'rgba32float';
  return format === 'rgba8' ? 'rgba8unorm' : state.format;
}

function notifyGuard(state: WgpuRenderState, renderTexture: Readonly<RenderTexture>): void {
  getWgpuRenderStateRuntime(state).wgpuRenderTextureGuard?.(
    state,
    renderTexture,
    explainWgpuRenderTexture(state, renderTexture),
  );
}
