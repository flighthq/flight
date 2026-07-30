import type {
  RenderTexture,
  RenderTargetFormat,
  WgpuRenderState,
  WgpuRenderTextureEntry,
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
  return entry?.status === 'ready' ? entry.target : null;
}

export function destroyWgpuRenderTexture(state: WgpuRenderState, renderTexture: Readonly<RenderTexture>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const entry = runtime.wgpuRenderTextureCache?.get(renderTexture);
  if (entry === undefined) return;
  destroyWgpuRenderTarget(state, entry.target);
  runtime.wgpuRenderTextureCache!.delete(renderTexture);
}

export function isWgpuRenderTextureReady(state: WgpuRenderState, renderTexture: Readonly<RenderTexture>): boolean {
  return getWgpuRenderTextureEntry(state, renderTexture)?.status === 'ready';
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
  const entry = ensureWgpuRenderTextureEntry(state, renderTexture);
  entry.status = 'writing';
  let rendered = false;
  try {
    beginWgpuRenderPass(state, entry.target);
    try {
      callback(state);
      rendered = true;
    } finally {
      endWgpuRenderPass(state);
    }
  } finally {
    entry.status = rendered ? 'ready' : 'unrendered';
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
  const descriptor = renderTexture.storage.target;
  const runtime = getWgpuRenderStateRuntime(state);
  const entries = (runtime.wgpuRenderTextureCache ??= new WeakMap());
  let entry = entries.get(renderTexture);
  if (entry === undefined) {
    const target = createWgpuRenderTarget(
      state,
      descriptor.width,
      descriptor.height,
      getWgpuRenderTextureFormat(state, descriptor.format),
      descriptor.colorSpace ?? renderTexture.colorSpace,
    );
    target.clearColors = [...(descriptor.clearColors ?? [])];
    target.clearDepth = descriptor.clearDepth ?? 1;
    entry = { status: 'unrendered', target };
    entries.set(renderTexture, entry);
  } else {
    resizeWgpuRenderTarget(state, entry.target, descriptor.width, descriptor.height);
  }
  return entry;
}

function getWgpuRenderTextureEntry(
  state: WgpuRenderState,
  renderTexture: Readonly<RenderTexture>,
): WgpuRenderTextureEntry | undefined {
  return getWgpuRenderStateRuntime(state).wgpuRenderTextureCache?.get(renderTexture);
}

function getWgpuRenderTextureFormat(state: WgpuRenderState, format: RenderTargetFormat | undefined): GPUTextureFormat {
  if (format === 'rgba16f') return 'rgba16float';
  if (format === 'rgba32f') return 'rgba32float';
  return format === 'rgba8' ? 'rgba8unorm' : state.format;
}
