import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';
import type { DropShadowFilter } from '@flighthq/types';

import { applyWebGLBlurFilter } from './webglBlurFilter';
import { clearWebGLFilterTarget } from './webglFilterPass';
import { applyBlitOffsetPass, applyBlitPass, applyTintPass } from './webglTintShader';

/**
 * Applies a drop shadow filter to `source` and writes the result to `dest`.
 * Rendering order: shadow (at offset, behind object) → source (unless
 * hideObject is true).
 *
 * `scratch` is a caller-provided array of three scratch targets of the same
 * dimensions as `dest` (tint mask, blurred shadow, and the blur's ping-pong
 * temp); the filter allocates nothing itself.
 *
 * inner and knockout shadows are not yet supported by the WebGL path.
 */
export function applyWebGLDropShadowFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  options: Omit<DropShadowFilter, 'type'> = {},
): void {
  if (options.inner || options.knockout) return;

  const angle = ((options.angle ?? 45) * Math.PI) / 180;
  const distance = options.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = options.color ?? 0;
  const alpha = options.alpha ?? 1;
  const strength = options.strength ?? 1;
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;
  const quality = options.quality ?? 1;
  const hideObject = options.hideObject ?? false;

  // strength > 1: composite the blurred shadow multiple times (iterative pass accumulation).
  const tintStrength = Math.min(1, strength);
  const shadowPasses = Math.max(1, Math.floor(strength));

  const mask = scratch[0];
  const blurred = scratch[1];
  const blurTemp = scratch[2];

  // Pass 1: extract alpha and tint with shadow color → mask
  applyTintPass(state, source, mask, color, alpha, tintStrength);

  // Pass 2–3: blur the tinted mask → blurred
  applyWebGLBlurFilter(state, mask, blurred, blurTemp, { blurX, blurY, quality });

  // Pass 4+: clear dest, draw shadow at offset; repeated for strength > 1
  clearWebGLFilterTarget(state, dest);
  for (let i = 0; i < shadowPasses; i++) {
    applyBlitOffsetPass(state, blurred, dest, dx, dy);
  }

  // Final: composite source over shadow (unless hideObject)
  if (!hideObject) {
    applyBlitPass(state, source, dest);
  }
}
