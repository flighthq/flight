import type { WgpuRenderState, WgpuRenderTarget, WgpuRenderTargetPool } from '@flighthq/types';

import { createWgpuRenderTarget, destroyWgpuRenderTarget } from './webgpuRenderTarget';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireWgpuRenderTarget must have a matching releaseWgpuRenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.
//
// MSAA is intentionally out of scope: Wgpu MSAA needs multisample-capable pipelines, so pooled
// targets stay sampleCount 1 — a follow-up once the effect pipelines grow multisample variants.

export function acquireWgpuRenderTarget(
  state: WgpuRenderState,
  pool: WgpuRenderTargetPool,
  descriptor: Readonly<{ width: number; height: number; format?: GPUTextureFormat }>,
): WgpuRenderTarget {
  const w = Math.max(1, Math.ceil(descriptor.width));
  const h = Math.max(1, Math.ceil(descriptor.height));
  const format = descriptor.format ?? state.format;

  for (let i = 0; i < pool.free.length; i++) {
    const candidate = pool.free[i];
    if (candidate.width === w && candidate.height === h && candidate.format === format) {
      pool.free.splice(i, 1);
      return candidate;
    }
  }
  return createWgpuRenderTarget(state, w, h, format);
}

export function createWgpuRenderTargetPool(): WgpuRenderTargetPool {
  return { free: [] };
}

export function destroyWgpuRenderTargetPool(state: WgpuRenderState, pool: WgpuRenderTargetPool): void {
  for (const target of pool.free) destroyWgpuRenderTarget(state, target);
  pool.free.length = 0;
}

export function releaseWgpuRenderTarget(pool: WgpuRenderTargetPool, target: WgpuRenderTarget): void {
  pool.free.push(target);
}
