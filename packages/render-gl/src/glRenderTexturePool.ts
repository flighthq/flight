import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRenderTexture, resetTextureUvTransform } from '@flighthq/texture/contract';
import type {
  EntityConstruction,
  GlRenderState,
  GlRenderTexturePool,
  RenderTarget,
  RenderTargetDescriptor,
  RenderTexture,
} from '@flighthq/types/contract';

import { createGlRenderTargetPool, destroyGlRenderTargetPool } from './glRenderTargetPool';
import { destroyGlRenderTexture, invalidateGlRenderTexture } from './glRenderTexture';

export function acquireGlRenderTexture(
  state: GlRenderState,
  pool: GlRenderTexturePool,
  descriptor: Readonly<RenderTargetDescriptor>,
): RenderTexture {
  assertUsablePool(state, pool);
  const renderTexture = pool.free.pop() ?? createRenderTexture(descriptor);
  applyRenderTargetDescriptor(renderTexture.source, descriptor);
  resetTextureUvTransform(renderTexture);
  renderTexture.colorSpace = descriptor.colorSpace ?? 'srgb';
  invalidateGlRenderTexture(state, renderTexture);
  pool.leased.add(renderTexture);
  return renderTexture;
}

export function createGlRenderTexturePool(): GlRenderTexturePool {
  const out = allocateEntity<GlRenderTexturePool>();
  out.context = null;
  out.destroyed = false;
  out.effectTargets = createGlRenderTargetPool();
  out.free = [];
  out.leased = new Set();
  return finishEntity(out);
}

// Destroys free and currently leased handles. A shutdown caller need not recover every outstanding
// display lease first; after this call the pool cannot be acquired again.
export function destroyGlRenderTexturePool(state: GlRenderState, pool: GlRenderTexturePool): void {
  if (pool.destroyed) return;
  assertPoolContext(state, pool);
  const textures = new Set([...pool.free, ...pool.leased]);
  for (const renderTexture of textures) destroyGlRenderTexture(state, renderTexture);
  pool.free.length = 0;
  pool.leased.clear();
  destroyGlRenderTargetPool(state, pool.effectTargets);
  pool.destroyed = true;
}

export function releaseGlRenderTexture(
  state: GlRenderState,
  pool: GlRenderTexturePool,
  renderTexture: RenderTexture,
): void {
  assertUsablePool(state, pool);
  if (!pool.leased.delete(renderTexture)) {
    throw new Error('releaseGlRenderTexture: texture is not leased from this pool');
  }
  invalidateGlRenderTexture(state, renderTexture, 'released');
  pool.free.push(renderTexture);
}

// Exception-safe bracket for source/scratch/result sets whose ownership ends together. A result shown
// by Sprite must instead remain manually leased until that frame's consumer is finished.
export function withGlRenderTextures<T>(
  state: GlRenderState,
  pool: GlRenderTexturePool,
  descriptors: ReadonlyArray<Readonly<RenderTargetDescriptor>>,
  callback: (textures: ReadonlyArray<RenderTexture>) => T,
): T {
  const textures: RenderTexture[] = [];
  try {
    for (const descriptor of descriptors) textures.push(acquireGlRenderTexture(state, pool, descriptor));
    return callback(textures);
  } finally {
    for (let i = textures.length - 1; i >= 0; i--) {
      const texture = textures[i];
      if (pool.leased.has(texture)) releaseGlRenderTexture(state, pool, texture);
    }
  }
}

function applyRenderTargetDescriptor(target: RenderTarget, descriptor: Readonly<RenderTargetDescriptor>): void {
  target.width = descriptor.width;
  target.height = descriptor.height;
  target.format = descriptor.format;
  target.colorAttachments = descriptor.colorAttachments;
  target.colorFormats = descriptor.colorFormats === undefined ? undefined : [...descriptor.colorFormats];
  target.sampleCount = descriptor.sampleCount;
  target.depth = descriptor.depth;
  target.colorSpace = descriptor.colorSpace ?? 'srgb';
  target.clearColors = descriptor.clearColors === undefined ? undefined : [...descriptor.clearColors];
  target.clearDepth = descriptor.clearDepth;
  target.version = (target.version + 1) >>> 0;
}

function assertUsablePool(state: GlRenderState, pool: GlRenderTexturePool): void {
  if (pool.destroyed) throw new Error('GlRenderTexturePool has been destroyed');
  assertPoolContext(state, pool);
}

function assertPoolContext(state: GlRenderState, pool: GlRenderTexturePool): void {
  if (pool.context === null) {
    pool.context = state.gl;
  } else if (pool.context !== state.gl) {
    throw new Error('GlRenderTexturePool cannot cross WebGL contexts');
  }
}
