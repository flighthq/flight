import type { DropShadowFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { applyWgpuBlitOffsetPass, applyWgpuBlitPass } from './wgpuBlitShader';
import { applyBoxBlurFilterToWgpu } from './wgpuBlurFilter';
import { clearWgpuFilterTarget } from './wgpuFilterPass';
import { applyWgpuTintPass } from './wgpuTintShader';

/**
 * Applies a drop shadow filter to `source`, writing the result to `dest`.
 * Compositing order: shadow at offset → source (unless `hideObject` is true).
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`
 * (tint mask, blurred shadow, and the blur's ping-pong temp). The filter
 * allocates nothing itself.
 *
 * `knockout` is not supported by the Wgpu path.
 */
export function applyDropShadowFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  scratch: WgpuRenderTarget[],
  filter: Readonly<Omit<DropShadowFilter, 'kind'>>,
): void {
  if (filter.knockout) return;

  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = filter.color ?? 0;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const hideObject = filter.hideObject ?? false;

  const tintStrength = Math.min(1, strength);
  const shadowPasses = Math.max(1, Math.floor(strength));

  const [mask, blurred, blurTemp] = scratch;

  applyWgpuTintPass(state, source, mask, color, alpha, tintStrength);
  applyBoxBlurFilterToWgpu(state, mask, blurred, blurTemp, {
    blurX: filter.blurX ?? 4,
    blurY: filter.blurY ?? 4,
    passes: quality,
  });

  clearWgpuFilterTarget(state, dest);
  for (let i = 0; i < shadowPasses; i++) {
    applyWgpuBlitOffsetPass(state, blurred, dest, dx, dy);
  }

  if (!hideObject) {
    applyWgpuBlitPass(state, source, dest);
  }
}
