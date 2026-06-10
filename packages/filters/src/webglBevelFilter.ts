import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { BevelFilter } from './index';
import { applyWebGLBlurFilter } from './webglBlurFilter';
import { clearWebGLFilterTarget } from './webglFilterPass';
import { applyBlitOffsetPass, applyBlitPass, applyTintPass } from './webglTintShader';

/**
 * Applies a bevel filter to `source` and writes the result to `dest`.
 *
 * Rendering order:
 *   1. Shadow layer (blurred source at +offset, shadow color)
 *   2. Highlight layer (blurred source at -offset, highlight color) composited over shadow
 *   3. Source composited on top (unless knockout)
 *
 * The bevel uses the blurred source alpha as the basis for both highlight and
 * shadow, giving soft beveled edges. For a hard bevel, set blurX/blurY to 0.
 *
 * `scratch` is a caller-provided array of three scratch targets of the same
 * dimensions as `dest` (tint buffer, blurred basis, and the blur's ping-pong
 * temp); the filter allocates nothing itself.
 */
export function applyWebGLBevelFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  options: Omit<BevelFilter, 'type'> = {},
): void {
  const angle = ((options.angle ?? 45) * Math.PI) / 180;
  const distance = options.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const shadowColor = options.shadowColor ?? 0x000000;
  const shadowAlpha = options.shadowAlpha ?? 1;
  const highlightColor = options.highlightColor ?? 0xffffff;
  const highlightAlpha = options.highlightAlpha ?? 1;
  const strength = options.strength ?? 1;
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;
  const quality = options.quality ?? 1;
  const knockout = options.knockout ?? false;

  const tinted = scratch[0];
  const blurred = scratch[1];
  const blurTemp = scratch[2];

  // Extract alpha for bevel basis — using highlight color (white) to keep
  // the tint neutral for the shared blur.
  applyTintPass(state, source, tinted, 0xffffff, 1, strength);
  applyWebGLBlurFilter(state, tinted, blurred, blurTemp, { blurX, blurY, quality });

  // Composite: shadow at +offset (bottom-right light hits bottom-right edge)
  clearWebGLFilterTarget(state, dest);

  // Draw shadow: blurred source tinted with shadow color at +offset
  applyTintPass(state, blurred, tinted, shadowColor, shadowAlpha, 1);
  applyBlitOffsetPass(state, tinted, dest, dx, dy);

  // Draw highlight: blurred source tinted with highlight color at -offset
  applyTintPass(state, blurred, tinted, highlightColor, highlightAlpha, 1);
  applyBlitOffsetPass(state, tinted, dest, -dx, -dy);

  // Draw source on top (unless knockout)
  if (!knockout) {
    applyBlitPass(state, source, dest);
  }
}
