import type { GlRenderTarget } from '@flighthq/render-gl';
import { clearGlRenderTarget } from '@flighthq/render-gl';
import type { OuterGlowFilter } from '@flighthq/types';
import type { GlRenderState } from '@flighthq/types';

import { applyGlBlitPass } from './glBlitShader';
import { applyBoxBlurFilterToGl } from './glBlurFilter';
import { applyGlTintPass } from './glTintShader';

/**
 * Applies an outer glow filter to `source`, writing the result to `dest`.
 * Compositing order: glow (centered, no offset) → source (unless `knockout`).
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`
 * (tint mask, blurred glow, and the blur's ping-pong temp). The filter
 * allocates nothing itself.
 */
export function applyOuterGlowFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  scratch: GlRenderTarget[],
  filter: Readonly<Omit<OuterGlowFilter, 'kind'>>,
): void {
  const color = filter.color ?? 0xff0000;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const knockout = filter.knockout ?? false;

  const tintStrength = Math.min(1, strength);
  const glowPasses = Math.max(1, Math.floor(strength));

  const [mask, blurred, blurTemp] = scratch;

  applyGlTintPass(state, source, mask, color, alpha, tintStrength);
  applyBoxBlurFilterToGl(state, mask, blurred, blurTemp, {
    blurX: filter.blurX ?? 6,
    blurY: filter.blurY ?? 6,
    passes: quality,
  });

  clearGlRenderTarget(state, dest);
  for (let i = 0; i < glowPasses; i++) {
    applyGlBlitPass(state, blurred, dest);
  }

  if (!knockout) {
    applyGlBlitPass(state, source, dest);
  }
}
