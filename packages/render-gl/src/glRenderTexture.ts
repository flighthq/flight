import type {
  GlRenderState,
  GlRenderTarget,
  GlRenderTextureExplanation,
  GlRenderTextureGuard,
  GlRenderTextureStatus,
  RenderTexture,
  SamplerLike,
  TextureColorSpace,
} from '@flighthq/types/contract';

import { applyGlSamplerState } from './glDraw';
import { beginGlRenderPass, endGlRenderPass } from './glRenderPass';
import { getGlRenderStateRuntime } from './glRenderState';
import { popGlRenderState, pushGlRenderState } from './glRenderStateBracket';
import { createGlRenderTarget, destroyGlRenderTarget, resizeGlRenderTarget } from './glRenderTarget';

// Binds a populated RenderTexture's resolved color attachment directly. No pixels cross the CPU and
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
  const entries = _entriesByContext.get(state.gl);
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
  return {
    height: entry?.target.height ?? renderTexture.height,
    status: entry?.status ?? 'unrendered',
    width: entry?.target.width ?? renderTexture.width,
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
 * Clears and populates a RenderTexture's hidden GL target. The callback may issue any GL-backed
 * rendering commands; framebuffer and fixed-function state are restored even when it throws.
 */
export function renderIntoGlRenderTexture(
  state: GlRenderState,
  renderTexture: RenderTexture,
  callback: (state: GlRenderState) => void,
): void {
  const entry = ensureEntry(state, renderTexture);
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
    entry.status = rendered ? 'ready' : 'unrendered';
    if (rendered) renderTexture.colorSpace = entry.target.colorSpace;
  }
}

export function setGlRenderTextureGuard(state: GlRenderState, guard: GlRenderTextureGuard | null): void {
  if (guard === null) _guardsByContext.delete(state.gl);
  else _guardsByContext.set(state.gl, guard);
}

function ensureEntry(state: GlRenderState, renderTexture: Readonly<RenderTexture>): GlRenderTextureEntry {
  const entries = getEntries(state);
  let entry = entries.get(renderTexture);
  if (entry === undefined) {
    entry = {
      status: 'unrendered',
      target: createGlRenderTarget(state, {
        colorSpace: renderTexture.colorSpace,
        depth: renderTexture.depth ? 'depth-stencil' : 'none',
        height: renderTexture.height,
        width: renderTexture.width,
      }),
    };
    entries.set(renderTexture, entry);
  } else {
    resizeGlRenderTarget(state, entry.target, renderTexture.width, renderTexture.height);
  }
  return entry;
}

function getEntries(state: GlRenderState): WeakMap<RenderTexture, GlRenderTextureEntry> {
  let entries = _entriesByContext.get(state.gl);
  if (entries === undefined) {
    entries = new WeakMap();
    _entriesByContext.set(state.gl, entries);
  }
  return entries;
}

function getEntry(state: GlRenderState, renderTexture: Readonly<RenderTexture>): GlRenderTextureEntry | undefined {
  return _entriesByContext.get(state.gl)?.get(renderTexture);
}

function notifyGuard(state: GlRenderState, renderTexture: Readonly<RenderTexture>): void {
  _guardsByContext.get(state.gl)?.(state, renderTexture, explainGlRenderTexture(state, renderTexture));
}

interface GlRenderTextureEntry {
  status: GlRenderTextureStatus;
  target: GlRenderTarget;
}

// Cache render states share a WebGL context with their screen state. Keying by context makes the
// target visible from either state while still isolating resources across independent contexts.
const _entriesByContext = new WeakMap<WebGL2RenderingContext, WeakMap<RenderTexture, GlRenderTextureEntry>>();
const _guardsByContext = new WeakMap<WebGL2RenderingContext, GlRenderTextureGuard>();
