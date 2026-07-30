import type {
  GlRenderState,
  GlRenderTextureEntry,
  GlRenderTextureExplanation,
  GlRenderTextureGuard,
  RenderTexture,
  SamplerLike,
  TextureColorSpace,
} from '@flighthq/types/contract';

import { applyGlSamplerState } from './glDraw';
import { beginGlRenderPass, endGlRenderPass } from './glRenderPass';
import { getGlRenderStateRuntime } from './glRenderState';
import { popGlRenderState, pushGlRenderState } from './glRenderStateBracket';
import { createGlRenderTarget, destroyGlRenderTarget, resizeGlRenderTarget } from './glRenderTarget';

// Binds a populated render texture's resolved color attachment directly. No pixels cross the CPU and
// no upload occurs. An unrendered or currently-written texture binds the null sentinel and returns
// null; optional guards can explain that otherwise silent fallback.
export function bindGlRenderTexture(
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  sampler?: Readonly<SamplerLike> | null,
): WebGLTexture | null {
  const entry = getEntry(state, renderTexture);
  if (entry === undefined || entry.status !== 'ready') {
    notifyGuard(state, renderTexture);
    state.gl.bindTexture(state.gl.TEXTURE_2D, null);
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentTexture = null;
    runtime.currentTextureStraightAlpha = false;
    return null;
  }

  const texture = entry.target.texture;
  const runtime = getGlRenderStateRuntime(state);
  state.gl.bindTexture(state.gl.TEXTURE_2D, texture);
  runtime.currentTexture = texture;
  runtime.currentTextureStraightAlpha = false;
  applyGlSamplerState(state, runtime, texture, sampler ?? renderTexture.sampler);
  return texture;
}

export function destroyGlRenderTexture(state: GlRenderState, renderTexture: Readonly<RenderTexture>): void {
  const entries = getGlRenderStateRuntime(state).glRenderTextureCache;
  const entry = entries?.get(renderTexture);
  if (entry === undefined) return;
  destroyGlRenderTarget(state, entry.target);
  entries!.delete(renderTexture);
}

export function explainGlRenderTexture(
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
): GlRenderTextureExplanation {
  const entry = getEntry(state, renderTexture);
  const descriptor = renderTexture.storage.target;
  return {
    height: entry?.target.height ?? descriptor?.height ?? 0,
    status: entry?.status ?? 'unrendered',
    width: entry?.target.width ?? descriptor?.width ?? 0,
  };
}

export function getGlRenderTextureColorSpace(
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
): TextureColorSpace {
  return getEntry(state, renderTexture)?.target.colorSpace ?? renderTexture.colorSpace;
}

export function isGlRenderTextureReady(state: GlRenderState, renderTexture: Readonly<RenderTexture>): boolean {
  const ready = getEntry(state, renderTexture)?.status === 'ready';
  if (!ready) notifyGuard(state, renderTexture);
  return ready;
}

/**
 * Clears and populates a render texture's hidden GL target. The callback may issue any GL-backed
 * rendering commands; framebuffer and fixed-function state are restored even when it throws.
 */
export function renderIntoGlRenderTexture(
  state: GlRenderState,
  renderTexture: RenderTexture,
  callback: (state: GlRenderState) => void,
): void {
  const entry = ensureEntry(state, renderTexture);
  const previousStatus = entry.status;
  entry.status = 'writing';
  let rendered = false;
  pushGlRenderState(state);
  try {
    beginGlRenderPass(state, entry.target);
    try {
      callback(state);
      rendered = true;
    } finally {
      endGlRenderPass(state);
    }
  } finally {
    popGlRenderState(state);
    // A rejected nested write shares this entry with the still-active outer writer. Preserve that
    // ownership so catching the nested precondition failure cannot make the outer attachment appear
    // unrendered. A top-level or replacement failure still invalidates the result to 'unrendered'.
    entry.status = rendered ? 'ready' : previousStatus === 'writing' ? 'writing' : 'unrendered';
    if (rendered) {
      renderTexture.colorSpace = entry.target.colorSpace;
      renderTexture.version = (renderTexture.version + 1) >>> 0;
    }
  }
}

export function setGlRenderTextureGuard(state: GlRenderState, guard: GlRenderTextureGuard | null): void {
  getGlRenderStateRuntime(state).glRenderTextureGuard = guard;
}

function ensureEntry(state: GlRenderState, renderTexture: Readonly<RenderTexture>): GlRenderTextureEntry {
  const descriptor = renderTexture.storage.target;
  const entries = getEntries(state);
  let entry = entries.get(renderTexture);
  if (entry === undefined) {
    entry = {
      status: 'unrendered',
      target: createGlRenderTarget(state, descriptor),
    };
    entries.set(renderTexture, entry);
  } else {
    resizeGlRenderTarget(state, entry.target, descriptor.width, descriptor.height);
  }
  return entry;
}

function getEntries(state: GlRenderState): WeakMap<RenderTexture, GlRenderTextureEntry> {
  return (getGlRenderStateRuntime(state).glRenderTextureCache ??= new WeakMap());
}

function getEntry(state: GlRenderState, renderTexture: Readonly<RenderTexture>): GlRenderTextureEntry | undefined {
  return getGlRenderStateRuntime(state).glRenderTextureCache?.get(renderTexture);
}

function notifyGuard(state: GlRenderState, renderTexture: Readonly<RenderTexture>): void {
  getGlRenderStateRuntime(state).glRenderTextureGuard?.(
    state,
    renderTexture,
    explainGlRenderTexture(state, renderTexture),
  );
}
