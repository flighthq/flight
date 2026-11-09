import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import type { RenderTargetColorSpace } from '@flighthq/render/contract';

import type {
  WgpuRenderState,
  WgpuRenderTargetPool,
  WgpuTextureFormat,
  WgpuTextureRenderTarget,
} from './contract.render-wgpu-types.ts';
import { createWgpuTextureRenderTarget, destroyWgpuTextureRenderTarget } from './wgpuTextureRenderTarget.ts';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireWgpuTextureRenderTarget must have a matching releaseWgpuTextureRenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.
//
export function acquireWgpuTextureRenderTarget(
  state: WgpuRenderState,
  pool: WgpuRenderTargetPool,
  descriptor: Readonly<{
    width: number;
    height: number;
    format?: WgpuTextureFormat;
    colorSpace?: RenderTargetColorSpace;
    sampleCount?: number;
  }>,
): WgpuTextureRenderTarget {
  const sampleCount = descriptor.sampleCount !== undefined && descriptor.sampleCount > 1 ? 4 : 1;
  const scale = sampleCount === 4 ? 2 : 1;
  const w = Math.max(1, Math.ceil(descriptor.width)) * scale;
  const h = Math.max(1, Math.ceil(descriptor.height)) * scale;
  const format = descriptor.format ?? state.format;

  for (let i = 0; i < pool.free.length; i++) {
    const candidate = pool.free[i];
    if (
      candidate.width === w &&
      candidate.height === h &&
      candidate.format === format &&
      candidate.sampleCount === sampleCount
    ) {
      pool.free.splice(i, 1);
      candidate.colorSpace = descriptor.colorSpace ?? 'srgb';
      return candidate;
    }
  }
  return createWgpuTextureRenderTarget(
    state,
    descriptor.width,
    descriptor.height,
    format,
    descriptor.colorSpace,
    sampleCount,
  );
}

export function createWgpuRenderTargetPool(): WgpuRenderTargetPool {
  const out = allocateEntity<WgpuRenderTargetPool>();
  initializeWgpuRenderTargetPool(out);
  return out;
}

export function destroyWgpuRenderTargetPool(pool: WgpuRenderTargetPool): void {
  for (const target of pool.free) destroyWgpuTextureRenderTarget(target);
  pool.free.length = 0;
}

export function initializeWgpuRenderTargetPool(out: EntityConstruction<WgpuRenderTargetPool>): void {
  out.free = [];
}

export function releaseWgpuTextureRenderTarget(pool: WgpuRenderTargetPool, target: WgpuTextureRenderTarget): void {
  pool.free.push(target);
}
