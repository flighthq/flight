import type {
  RenderTargetDescriptor,
  WebGLRenderState,
  WebGLRenderTarget,
  WebGLRenderTargetPool,
} from '@flighthq/types';

import { createWebGLRenderTarget, destroyWebGLRenderTarget } from './webglRenderTarget';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireWebGLRenderTarget must have a matching releaseWebGLRenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.

export function acquireWebGLRenderTarget(
  state: WebGLRenderState,
  pool: WebGLRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
): WebGLRenderTarget {
  const w = Math.max(1, Math.ceil(descriptor.width));
  const h = Math.max(1, Math.ceil(descriptor.height));
  const format = descriptor.format ?? 'rgba8';
  const sampleCount = Math.max(1, descriptor.sampleCount ?? 1);

  for (let i = 0; i < pool.free.length; i++) {
    const candidate = pool.free[i];
    if (
      candidate.width === w &&
      candidate.height === h &&
      candidate.format === format &&
      candidate.sampleCount === sampleCount
    ) {
      pool.free.splice(i, 1);
      return candidate;
    }
  }
  return createWebGLRenderTarget(state, descriptor);
}

export function createWebGLRenderTargetPool(): WebGLRenderTargetPool {
  return { free: [] };
}

export function destroyWebGLRenderTargetPool(state: WebGLRenderState, pool: WebGLRenderTargetPool): void {
  for (const target of pool.free) destroyWebGLRenderTarget(state, target);
  pool.free.length = 0;
}

export function releaseWebGLRenderTarget(pool: WebGLRenderTargetPool, target: WebGLRenderTarget): void {
  pool.free.push(target);
}
