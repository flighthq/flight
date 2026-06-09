import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import { createWebGLRenderTarget, destroyWebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { GlowFilter } from './index';
import { applyWebGLBlurFilter } from './webglBlurFilter';
import { clearWebGLFilterTarget } from './webglFilterPass';
import { applyBlitPass, applyTintPass } from './webglTintShader';

/**
 * Applies a glow filter to `source` and writes the result to `dest`.
 * Rendering order: glow (centered, no offset) → source (unless knockout).
 * inner glow is not yet supported by the WebGL path.
 */
export function applyWebGLGlowFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  options: Omit<GlowFilter, 'type'> = {},
): void {
  if (options.inner) return;

  const color = options.color ?? 0xff0000;
  const alpha = options.alpha ?? 1;
  const strength = options.strength ?? 1;
  const blurX = options.blurX ?? 6;
  const blurY = options.blurY ?? 6;
  const quality = options.quality ?? 1;
  const knockout = options.knockout ?? false;

  // strength > 1: composite the blurred glow multiple times (iterative pass accumulation).
  // The tint pass uses min(1, strength) to avoid per-pixel saturation on the raw source alpha.
  const tintStrength = Math.min(1, strength);
  const glowPasses = Math.max(1, Math.floor(strength));

  const w = source.width;
  const h = source.height;

  const mask = createWebGLRenderTarget(state, w, h);
  const blurred = createWebGLRenderTarget(state, w, h);

  // Pass 1: tint source alpha with glow color → mask
  applyTintPass(state, source, mask, color, alpha, tintStrength);

  // Pass 2–3: blur the tinted mask
  applyWebGLBlurFilter(state, mask, blurred, { blurX, blurY, quality });

  // Pass 4+: clear dest, composite glow (centered, no offset); repeated for strength > 1
  clearWebGLFilterTarget(state, dest);
  for (let i = 0; i < glowPasses; i++) {
    applyBlitPass(state, blurred, dest);
  }

  // Final: composite source on top (unless knockout)
  if (!knockout) {
    applyBlitPass(state, source, dest);
  }

  destroyWebGLRenderTarget(state, mask);
  destroyWebGLRenderTarget(state, blurred);
}
