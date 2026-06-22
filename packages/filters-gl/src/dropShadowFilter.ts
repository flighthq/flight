import type { GlRenderTarget } from '@flighthq/render-gl';
import { clearGlRenderTarget } from '@flighthq/render-gl';
import type { DropShadowFilter } from '@flighthq/types';
import type { GlRenderState } from '@flighthq/types';

import { applyBoxBlurFilterToGl } from './blurFilter';
import { applyGlBlitOffsetPass, applyGlBlitPass, applyGlTintPass } from './tintShader';

/**
 * Applies a drop shadow filter to `source`, writing the result to `dest`.
 * Compositing order: shadow at offset → source (unless `hideObject` is true).
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`
 * (tint mask, blurred shadow, and the blur's ping-pong temp). The filter
 * allocates nothing itself.
 *
 * `knockout` is not yet supported by the Gl path.
 */
export function applyDropShadowFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  scratch: GlRenderTarget[],
  filter: Readonly<Omit<DropShadowFilter, 'type'>>,
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

  applyGlTintPass(state, source, mask, color, alpha, tintStrength);
  applyBoxBlurFilterToGl(state, mask, blurred, blurTemp, {
    blurX: filter.blurX ?? 4,
    blurY: filter.blurY ?? 4,
    passes: quality,
  });

  clearGlRenderTarget(state, dest);
  for (let i = 0; i < shadowPasses; i++) {
    applyGlBlitOffsetPass(state, blurred, dest, dx, dy);
  }

  if (!hideObject) {
    applyGlBlitPass(state, source, dest);
  }
}
