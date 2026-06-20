import type { WebGPURenderState, WebGPURenderTarget, WebGPURenderTargetPool } from '@flighthq/types';

import { createWebGPURenderTarget, destroyWebGPURenderTarget } from './webgpuRenderTarget';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireWebGPURenderTarget must have a matching releaseWebGPURenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.
//
// MSAA is intentionally out of scope: WebGPU MSAA needs multisample-capable pipelines, so pooled
// targets stay sampleCount 1 — a follow-up once the effect pipelines grow multisample variants.

export function acquireWebGPURenderTarget(
  state: WebGPURenderState,
  pool: WebGPURenderTargetPool,
  descriptor: Readonly<{ width: number; height: number; format?: GPUTextureFormat }>,
): WebGPURenderTarget {
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
  return createWebGPURenderTarget(state, w, h, format);
}

export function createWebGPURenderTargetPool(): WebGPURenderTargetPool {
  return { free: [] };
}

export function destroyWebGPURenderTargetPool(state: WebGPURenderState, pool: WebGPURenderTargetPool): void {
  for (const target of pool.free) destroyWebGPURenderTarget(state, target);
  pool.free.length = 0;
}

export function releaseWebGPURenderTarget(pool: WebGPURenderTargetPool, target: WebGPURenderTarget): void {
  pool.free.push(target);
}
