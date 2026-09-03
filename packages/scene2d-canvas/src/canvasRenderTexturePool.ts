import { createEntity } from '@flighthq/entity/contract';
import { createRenderTexture, resetTextureUvTransform } from '@flighthq/texture/contract';
import type {
  CanvasRenderState,
  CanvasRenderSurfaceCreator,
  CanvasRenderTexturePool,
  RenderTarget,
  RenderTargetDescriptor,
  RenderTexture,
} from '@flighthq/types/contract';

import { destroyCanvasRenderTarget } from './canvasRenderTarget';
import { destroyCanvasRenderTexture, invalidateCanvasRenderTexture } from './canvasRenderTexture';

export function acquireCanvasRenderTexture(
  state: CanvasRenderState,
  pool: CanvasRenderTexturePool,
  descriptor: Readonly<RenderTargetDescriptor>,
): RenderTexture {
  assertUsablePool(state, pool);
  const renderTexture = pool.free.pop() ?? createRenderTexture(descriptor);
  applyRenderTargetDescriptor(renderTexture.source, descriptor);
  resetTextureUvTransform(renderTexture);
  renderTexture.colorSpace = descriptor.colorSpace ?? 'srgb';
  invalidateCanvasRenderTexture(state, renderTexture);
  pool.leased.add(renderTexture);
  return renderTexture;
}

export function createCanvasRenderTexturePool(creator: Readonly<CanvasRenderSurfaceCreator>): CanvasRenderTexturePool {
  return createEntity({
    destroyed: false,
    effectTargets: { creator, free: [], inUse: [] },
    free: [],
    leased: new Set(),
    owner: null,
  });
}

// Drops both free and outstanding handles plus effect-runner scratch canvases. A shutdown caller
// need not recover every displayed lease first; the pool becomes permanently unusable afterward.
export function destroyCanvasRenderTexturePool(state: CanvasRenderState, pool: CanvasRenderTexturePool): void {
  if (pool.destroyed) return;
  assertPoolOwner(state, pool);
  const textures = new Set([...pool.free, ...pool.leased]);
  for (const renderTexture of textures) destroyCanvasRenderTexture(state, renderTexture);
  pool.free.length = 0;
  pool.leased.clear();
  for (const target of [...pool.effectTargets.free, ...pool.effectTargets.inUse]) destroyCanvasRenderTarget(target);
  pool.effectTargets.free.length = 0;
  pool.effectTargets.inUse.length = 0;
  pool.owner = null;
  pool.destroyed = true;
}

export function releaseCanvasRenderTexture(
  state: CanvasRenderState,
  pool: CanvasRenderTexturePool,
  renderTexture: RenderTexture,
): void {
  assertUsablePool(state, pool);
  if (!pool.leased.delete(renderTexture)) {
    throw new Error('releaseCanvasRenderTexture: texture is not leased from this pool');
  }
  invalidateCanvasRenderTexture(state, renderTexture, 'released');
  pool.free.push(renderTexture);
}

export function withCanvasRenderTextures<T>(
  state: CanvasRenderState,
  pool: CanvasRenderTexturePool,
  descriptors: ReadonlyArray<Readonly<RenderTargetDescriptor>>,
  callback: (textures: ReadonlyArray<RenderTexture>) => T,
): T {
  const textures: RenderTexture[] = [];
  try {
    for (const descriptor of descriptors) textures.push(acquireCanvasRenderTexture(state, pool, descriptor));
    return callback(textures);
  } finally {
    for (let i = textures.length - 1; i >= 0; i--) {
      const texture = textures[i];
      if (pool.leased.has(texture)) releaseCanvasRenderTexture(state, pool, texture);
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

function assertUsablePool(state: CanvasRenderState, pool: CanvasRenderTexturePool): void {
  if (pool.destroyed) throw new Error('CanvasRenderTexturePool has been destroyed');
  assertPoolOwner(state, pool);
}

function assertPoolOwner(state: CanvasRenderState, pool: CanvasRenderTexturePool): void {
  const owner = state;
  if (pool.owner === null) {
    pool.owner = owner;
  } else if (pool.owner !== owner) {
    throw new Error('CanvasRenderTexturePool cannot cross screen render states');
  }
}
