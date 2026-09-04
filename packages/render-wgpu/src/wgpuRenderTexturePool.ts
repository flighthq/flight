import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRenderTexture, resetTextureUvTransform } from '@flighthq/texture/contract';
import type {
  EntityConstruction,
  RenderTarget,
  RenderTargetDescriptor,
  RenderTexture,
  WgpuRenderState,
  WgpuRenderTexturePool,
} from '@flighthq/types/contract';

import { createWgpuRenderTargetPool, destroyWgpuRenderTargetPool } from './wgpuRenderTargetPool';
import { destroyWgpuRenderTexture, invalidateWgpuRenderTexture } from './wgpuRenderTexture';

export function acquireWgpuRenderTexture(
  state: WgpuRenderState,
  pool: WgpuRenderTexturePool,
  descriptor: Readonly<RenderTargetDescriptor>,
): RenderTexture {
  assertUsablePool(state, pool);
  const renderTexture = pool.free.pop() ?? createRenderTexture(descriptor);
  applyRenderTargetDescriptor(renderTexture.source, descriptor);
  resetTextureUvTransform(renderTexture);
  renderTexture.colorSpace = descriptor.colorSpace ?? 'srgb';
  invalidateWgpuRenderTexture(state, renderTexture);
  pool.leased.add(renderTexture);
  return renderTexture;
}

export function createWgpuRenderTexturePool(): WgpuRenderTexturePool {
  const out = allocateEntity<WgpuRenderTexturePool>();
  initializeWgpuRenderTexturePool(out);
  return finishEntity(out);
}

// Destroys both free and outstanding handles. Shutdown does not require callers to recover every
// displayed lease first; the pool becomes permanently unusable afterward.
export function destroyWgpuRenderTexturePool(state: WgpuRenderState, pool: WgpuRenderTexturePool): void {
  if (pool.destroyed) return;
  assertPoolDevice(state, pool);
  const textures = new Set([...pool.free, ...pool.leased]);
  for (const renderTexture of textures) destroyWgpuRenderTexture(state, renderTexture);
  pool.free.length = 0;
  pool.leased.clear();
  destroyWgpuRenderTargetPool(state, pool.effectTargets);
  pool.destroyed = true;
}

export function initializeWgpuRenderTexturePool(out: EntityConstruction<WgpuRenderTexturePool>): void {
  out.device = null;
  out.destroyed = false;
  out.effectTargets = createWgpuRenderTargetPool();
  out.free = [];
  out.leased = new Set();
}

export function releaseWgpuRenderTexture(
  state: WgpuRenderState,
  pool: WgpuRenderTexturePool,
  renderTexture: RenderTexture,
): void {
  assertUsablePool(state, pool);
  if (!pool.leased.delete(renderTexture)) {
    throw new Error('releaseWgpuRenderTexture: texture is not leased from this pool');
  }
  invalidateWgpuRenderTexture(state, renderTexture, 'released');
  pool.free.push(renderTexture);
}

export function withWgpuRenderTextures<T>(
  state: WgpuRenderState,
  pool: WgpuRenderTexturePool,
  descriptors: ReadonlyArray<Readonly<RenderTargetDescriptor>>,
  callback: (textures: ReadonlyArray<RenderTexture>) => T,
): T {
  const textures: RenderTexture[] = [];
  try {
    for (const descriptor of descriptors) textures.push(acquireWgpuRenderTexture(state, pool, descriptor));
    return callback(textures);
  } finally {
    for (let i = textures.length - 1; i >= 0; i--) {
      const texture = textures[i];
      if (pool.leased.has(texture)) releaseWgpuRenderTexture(state, pool, texture);
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

function assertUsablePool(state: WgpuRenderState, pool: WgpuRenderTexturePool): void {
  if (pool.destroyed) throw new Error('WgpuRenderTexturePool has been destroyed');
  assertPoolDevice(state, pool);
}

function assertPoolDevice(state: WgpuRenderState, pool: WgpuRenderTexturePool): void {
  if (pool.device === null) {
    pool.device = state.device;
  } else if (pool.device !== state.device) {
    throw new Error('WgpuRenderTexturePool cannot cross GPU devices');
  }
}
