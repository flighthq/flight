import { resolveRenderTargetDescriptor } from '@flighthq/render/contract';
import type {
  GlRenderState,
  GlRenderTextureEntry,
  GlRenderTextureExplanation,
  GlRenderTextureGuard,
  RenderTexture,
  SamplerLike,
  TextureColorSpace,
} from '@flighthq/types/contract';

import { applyGlSamplerState, bindGlTextureRealization } from './glDraw';
import { clearGlRenderTarget } from './glFullscreenPass';
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
    bindGlTextureRealization(state, null);
    return null;
  }

  const texture = entry.target.texture;
  const runtime = getGlRenderStateRuntime(state);
  bindGlTextureRealization(state, { straightAlpha: false, texture });
  applyGlSamplerState(state, runtime, texture, sampler ?? renderTexture.sampler);
  return texture;
}

/** Clears a RenderTexture to transparent, publishes it as ready, and restores the caller's GL state. */
export function clearGlRenderTexture(state: GlRenderState, renderTexture: RenderTexture): void {
  writeGlRenderTextureTarget(state, renderTexture, (target) => {
    pushGlRenderState(state);
    try {
      clearGlRenderTarget(state, target);
    } finally {
      popGlRenderState(state);
    }
  });
}

export function destroyGlRenderTexture(state: GlRenderState, renderTexture: Readonly<RenderTexture>): void {
  const entries = getGlRenderStateRuntime(state).context.glRenderTextureCache;
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
  const descriptor = renderTexture.source;
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

// Resolves the hidden target only while the handle owns completed content. This is the backend bridge
// used by target-to-target effect wrappers; app-level composition keeps using RenderTexture.
export function getGlRenderTextureTarget(
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
): Readonly<GlRenderTextureEntry['target']> | null {
  const entry = getEntry(state, renderTexture);
  if (entry?.status === 'ready') return entry.target;
  notifyGuard(state, renderTexture);
  return null;
}

export function invalidateGlRenderTexture(
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  status: 'released' | 'unrendered' = 'unrendered',
): void {
  const entry = getEntry(state, renderTexture);
  if (entry !== undefined) entry.status = status;
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
  writeGlRenderTextureTarget(state, renderTexture, (target) => {
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
  });
}

export function setGlRenderTextureGuard(state: GlRenderState, guard: GlRenderTextureGuard | null): void {
  getGlRenderStateRuntime(state).glRenderTextureGuard = guard;
}

// Gives a backend recipe the hidden destination without opening a pass. The recipe may run several
// target passes; success atomically publishes the RenderTexture, while failure invalidates it.
export function writeGlRenderTextureTarget<T>(
  state: GlRenderState,
  renderTexture: RenderTexture,
  callback: (target: GlRenderTextureEntry['target']) => T,
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
    if (rendered) {
      renderTexture.colorSpace = entry.target.colorSpace;
      renderTexture.version = (renderTexture.version + 1) >>> 0;
    }
  }
}

function ensureEntry(state: GlRenderState, renderTexture: Readonly<RenderTexture>): GlRenderTextureEntry {
  const descriptor = renderTexture.source;
  const entries = getEntries(state);
  let entry = entries.get(renderTexture);
  if (entry === undefined) {
    entry = {
      status: 'unrendered',
      target: createGlRenderTarget(state, descriptor),
    };
    entries.set(renderTexture, entry);
  } else {
    const requested = resolveRenderTargetDescriptor(descriptor);
    if (matchesGlRenderTextureAllocation(entry.target, requested)) {
      resizeGlRenderTarget(state, entry.target, descriptor.width, descriptor.height);
      entry.target.requestedAxes = {
        width: requested.width,
        height: requested.height,
        format: requested.format,
        colorAttachments: requested.colorAttachments,
        colorFormats: [...requested.colorFormats],
        sampleCount: requested.sampleCount,
        depth: requested.depth,
        colorSpace: requested.colorSpace,
      };
      entry.target.clearColors = [...requested.clearColors];
      entry.target.clearDepth = requested.clearDepth;
    } else {
      destroyGlRenderTarget(state, entry.target);
      entry.target = createGlRenderTarget(state, descriptor);
      entry.status = 'unrendered';
    }
  }
  return entry;
}

function matchesGlRenderTextureAllocation(
  target: Readonly<GlRenderTextureEntry['target']>,
  descriptor: ReturnType<typeof resolveRenderTargetDescriptor>,
): boolean {
  const requested = target.requestedAxes;
  return (
    requested.format === descriptor.format &&
    requested.colorAttachments === descriptor.colorAttachments &&
    requested.colorFormats.length === descriptor.colorFormats.length &&
    requested.colorFormats.every((format, index) => format === descriptor.colorFormats[index]) &&
    requested.sampleCount === descriptor.sampleCount &&
    requested.depth === descriptor.depth &&
    requested.colorSpace === descriptor.colorSpace
  );
}

function getEntries(state: GlRenderState): WeakMap<RenderTexture, GlRenderTextureEntry> {
  return (getGlRenderStateRuntime(state).context.glRenderTextureCache ??= new WeakMap());
}

function getEntry(state: GlRenderState, renderTexture: Readonly<RenderTexture>): GlRenderTextureEntry | undefined {
  return getGlRenderStateRuntime(state).context.glRenderTextureCache?.get(renderTexture);
}

function notifyGuard(state: GlRenderState, renderTexture: Readonly<RenderTexture>): void {
  getGlRenderStateRuntime(state).glRenderTextureGuard?.(
    state,
    renderTexture,
    explainGlRenderTexture(state, renderTexture),
  );
}
