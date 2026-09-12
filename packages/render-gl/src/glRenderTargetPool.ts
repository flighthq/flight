import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { resolveRenderTargetDescriptor } from '@flighthq/render/contract';
import type {
  EntityConstruction,
  GlRenderState,
  GlTextureRenderTarget,
  GlTextureRenderTargetPool,
  RenderTargetAxes,
  RenderTargetDescriptor,
  RenderTargetFormatPolicy,
} from '@flighthq/types/contract';

import { clearGlRenderTarget } from './glFullscreenPass';
import { createGlTextureRenderTarget, destroyGlTextureRenderTarget, resolveGlRenderTargetAxes } from './glRenderTarget';

// Lends reusable intermediate targets to multi-pass effect recipes. acquire/release are paired
// brackets: every acquireGlTextureRenderTarget must have a matching releaseGlTextureRenderTarget. A released
// target returns to the free list (its GPU storage is kept) rather than being destroyed.
//
// Acquired targets are handed back clean: a reused target is cleared before return so a non-covering
// pass never composites onto a previous user's contents (a freshly created target is already zeroed by
// the GL implementation). Clean surfaces are the default; skipping the clear would be an opt-in
// optimization for provably-covering consumers, not the baseline behavior.

export function acquireGlTextureRenderTarget(
  state: GlRenderState,
  pool: GlTextureRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
): GlTextureRenderTarget;
export function acquireGlTextureRenderTarget(
  state: GlRenderState,
  pool: GlTextureRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'preferred',
): GlTextureRenderTarget;
export function acquireGlTextureRenderTarget(
  state: GlRenderState,
  pool: GlTextureRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'required',
): GlTextureRenderTarget | null;
export function acquireGlTextureRenderTarget(
  state: GlRenderState,
  pool: GlTextureRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy,
): GlTextureRenderTarget | null;
export function acquireGlTextureRenderTarget(
  state: GlRenderState,
  pool: GlTextureRenderTargetPool,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy = 'preferred',
): GlTextureRenderTarget | null {
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
      clearGlRenderTarget(state, candidate, { color: [0, 0, 0, 0] });
      return candidate;
    }
  }
  return createGlTextureRenderTarget(state, descriptor, formatPolicy);
}

export function createGlTextureRenderTargetPool(): GlTextureRenderTargetPool {
  const out = allocateEntity<GlTextureRenderTargetPool>();
  initializeGlTextureRenderTargetPool(out);
  return finishEntity(out);
}

export function destroyGlTextureRenderTargetPool(state: GlRenderState, pool: GlTextureRenderTargetPool): void {
  for (const target of pool.free) destroyGlTextureRenderTarget(state, target);
  pool.free.length = 0;
}

export function initializeGlTextureRenderTargetPool(out: EntityConstruction<GlTextureRenderTargetPool>): void {
  out.free = [];
}

export function releaseGlTextureRenderTarget(pool: GlTextureRenderTargetPool, target: GlTextureRenderTarget): void {
  pool.free.push(target);
}

function matchesGlRenderTargetAxes(target: Readonly<GlTextureRenderTarget>, axes: Readonly<RenderTargetAxes>): boolean {
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
