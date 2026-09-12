import type { RenderTargetColorSpace, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { isWgpuScreenRenderTarget } from './wgpuScreenRenderTarget';

// Stamps the color space produced into the target the innermost open pass is bound to. False means no
// pass is open, so there is nothing to stamp and no present step will read the declaration.
export function declareWgpuRenderTargetColorSpace(state: WgpuRenderState, colorSpace: RenderTargetColorSpace): boolean {
  const target = getWgpuRenderStateRuntime(state).currentRenderTarget;
  if (target === null) return false;
  target.colorSpace = colorSpace;
  return true;
}

/**
 * Device pixels per logical pixel in this target — 2 when it is supersampled, 1 otherwise. Screen and
 * texture targets reach supersampling by different routes (an antialias option versus a sample count),
 * and this is the one place that difference is resolved.
 *
 * ★ THE ALLOCATOR AND THE PROJECTION MUST AGREE, AND THEY DID NOT. The allocator grows a `sampleCount: 4`
 * target to 2x per axis, while the 2D projection divides by the pass viewport to reach NDC. With the
 * physical extent in that field, logical x = 800 mapped to NDC 0 — the middle — so the scene filled
 * exactly the left half and top half of its own target and the present then downsampled the lot, landing
 * the picture at quarter size in the top-left corner. Measured on effect-sepia: the WebGPU frame equalled
 * the WebGL frame sampled at (2x, 2y) on 12 of 12 grid points.
 *
 * The scale is DERIVED rather than stored, so there is one rule and no second field to fall out of step
 * with the texture that was actually allocated.
 */
export function getWgpuRenderTargetSupersampleScale(target: Readonly<WgpuRenderTarget>): number {
  if (isWgpuScreenRenderTarget(target)) return target.antialias ? WGPU_RENDER_TARGET_SUPERSAMPLE_SCALE : 1;
  return target.sampleCount === 4 ? WGPU_RENDER_TARGET_SUPERSAMPLE_SCALE : 1;
}

// The one supersample factor the whole backend uses; the per-target allocators multiply by it.
const WGPU_RENDER_TARGET_SUPERSAMPLE_SCALE = 2;
