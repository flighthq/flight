import { resolveRenderTargetDescriptor } from '@flighthq/render/contract';
import type {
  RenderTargetClear,
  RenderTexture,
  WgpuRenderPass,
  RenderTargetFormat,
  WgpuRenderState,
  WgpuRenderTextureEntry,
  WgpuRenderTextureExplanation,
  WgpuRenderTextureGuard,
  WgpuTextureEntry,
} from '@flighthq/types/contract';

import { beginWgpuRenderPass, endWgpuRenderPass } from './wgpuRenderPass';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  createWgpuTextureRenderTarget,
  destroyWgpuTextureRenderTarget,
  resizeWgpuTextureRenderTarget,
} from './wgpuTextureRenderTarget';

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
  destroyWgpuTextureRenderTarget(entry.target);
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
 * Clears and populates a render texture's hidden WebGPU target. The callback receives the pass bound to
 * that target — the same handle every other draw entry point takes — and the enclosing pass is restored
 * even when the callback throws. `clear` is what the target starts from; it defaults to transparent black
 * with depth and stencil reset, which is what a texture composited over a scene wants.
 */
export function renderIntoWgpuRenderTexture(
  state: WgpuRenderState,
  renderTexture: RenderTexture,
  callback: (pass: WgpuRenderPass) => void,
  clear: Readonly<RenderTargetClear> = { color: [0, 0, 0, 0], depth: 1.0, stencil: 0 },
): void {
  writeWgpuRenderTextureTarget(state, renderTexture, (target) => {
    const pass = beginWgpuRenderPass(state, target, clear);
    try {
      callback(pass);
    } finally {
      endWgpuRenderPass(pass);
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
    const target = createWgpuTextureRenderTarget(
      state,
      requested.width,
      requested.height,
      format,
      colorSpace,
      requested.sampleCount,
    );
    entry = { status: 'unrendered', target };
    entries.set(renderTexture, entry);
  } else {
    if (entry.target.format !== format) {
      destroyWgpuTextureRenderTarget(entry.target);
      entry.target = createWgpuTextureRenderTarget(
        state,
        requested.width,
        requested.height,
        format,
        colorSpace,
        requested.sampleCount,
      );
      entry.status = 'unrendered';
    } else {
      resizeWgpuTextureRenderTarget(state, entry.target, requested.width, requested.height, requested.sampleCount);
      entry.target.colorSpace = colorSpace;
    }
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
