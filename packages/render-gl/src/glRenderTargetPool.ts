import { createEntity } from '@flighthq/entity/contract';
import { resolveRenderTargetDescriptor } from '@flighthq/render/contract';
import type {
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
  RenderTargetAxes,
  RenderTargetDescriptor,
  RenderTargetFormatPolicy,
} from '@flighthq/types/contract';

import { clearGlRenderTarget } from './glFullscreenPass';
import { createGlRenderTarget, destroyGlRenderTarget, resolveGlRenderTargetAxes } from './glRenderTarget';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireGlRenderTarget must have a matching releaseGlRenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.
//
// Acquired targets are handed back clean: a reused target is cleared before return so a non-covering
// pass never composites onto a previous user's contents (a freshly created target is already zeroed by
// the GL implementation). Clean surfaces are the default; skipping the clear would be an opt-in
// optimization for provably-covering consumers, not the baseline behavior.

export function acquireGlRenderTarget(
  state: GlRenderState,
  pool: GlRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
): GlRenderTarget;
export function acquireGlRenderTarget(
  state: GlRenderState,
  pool: GlRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'preferred',
): GlRenderTarget;
export function acquireGlRenderTarget(
  state: GlRenderState,
  pool: GlRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'required',
): GlRenderTarget | null;
export function acquireGlRenderTarget(
  state: GlRenderState,
  pool: GlRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy,
): GlRenderTarget | null;
export function acquireGlRenderTarget(
  state: GlRenderState,
  pool: GlRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy = 'preferred',
): GlRenderTarget | null {
  const requested = resolveRenderTargetDescriptor(descriptor);
  const effective = resolveGlRenderTargetAxes(state, requested, formatPolicy);
  if (!effective) return null;

  for (let i = 0; i < pool.free.length; i++) {
    const candidate = pool.free[i];
    if (matchesGlRenderTargetAxes(candidate, effective)) {
      pool.free.splice(i, 1);
      candidate.requestedAxes = {
        width: requested.width,
        height: requested.height,
        format: requested.format,
        colorAttachments: requested.colorAttachments,
        colorFormats: [...requested.colorFormats],
        sampleCount: requested.sampleCount,
        depth: requested.depth,
        colorSpace: requested.colorSpace,
      };
      candidate.clearColors = [...requested.clearColors];
      candidate.clearDepth = requested.clearDepth;
      clearGlRenderTarget(state, candidate);
      return candidate;
    }
  }
  return createGlRenderTarget(state, descriptor, formatPolicy);
}

export function createGlRenderTargetPool(): GlRenderTargetPool {
  return createEntity({ free: [] });
}

export function destroyGlRenderTargetPool(state: GlRenderState, pool: GlRenderTargetPool): void {
  for (const target of pool.free) destroyGlRenderTarget(state, target);
  pool.free.length = 0;
}

export function releaseGlRenderTarget(pool: GlRenderTargetPool, target: GlRenderTarget): void {
  pool.free.push(target);
}

function matchesGlRenderTargetAxes(target: Readonly<GlRenderTarget>, axes: Readonly<RenderTargetAxes>): boolean {
  return (
    target.width === axes.width &&
    target.height === axes.height &&
    target.format === axes.format &&
    target.colorAttachments === axes.colorAttachments &&
    target.colorFormats.length === axes.colorFormats.length &&
    target.colorFormats.every((format, index) => format === axes.colorFormats[index]) &&
    target.sampleCount === axes.sampleCount &&
    target.depth === axes.depth &&
    target.colorSpace === axes.colorSpace
  );
}
