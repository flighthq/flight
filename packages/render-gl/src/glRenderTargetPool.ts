import type { GlRenderState, GlRenderTarget, GlRenderTargetPool, RenderTargetDescriptor } from '@flighthq/types';

import { createGlRenderTarget, destroyGlRenderTarget } from './glRenderTarget';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireGlRenderTarget must have a matching releaseGlRenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.

export function acquireGlRenderTarget(
  state: GlRenderState,
  pool: GlRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
): GlRenderTarget {
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
  return createGlRenderTarget(state, descriptor);
}

export function createGlRenderTargetPool(): GlRenderTargetPool {
  return { free: [] };
}

export function destroyGlRenderTargetPool(state: GlRenderState, pool: GlRenderTargetPool): void {
  for (const target of pool.free) destroyGlRenderTarget(state, target);
  pool.free.length = 0;
}

export function releaseGlRenderTarget(pool: GlRenderTargetPool, target: GlRenderTarget): void {
  pool.free.push(target);
}
