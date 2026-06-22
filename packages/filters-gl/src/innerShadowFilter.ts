import type { GlRenderTarget } from '@flighthq/render-gl';
import { clearGlRenderTarget, compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlFullscreenProgram, GlRenderState, InnerShadowFilter } from '@flighthq/types';

import { applyBoxBlurFilterToGl } from './blurFilter';
import { applyGlBlitOffsetPass, applyGlBlitPass, applyGlInvertTintPass } from './tintShader';

// Why: all filter passes use ONE/ONE_MINUS_SRC_ALPHA premultiplied blending — they never
// implicitly clear their destination. Reusing a scratch target without clearing first means
// the previous pass's content bleeds through wherever the new pass's alpha is 0. Clearing
// before each reuse gives clean replacement semantics.

// Same clip shader as innerGlowFilter — clips unit-0 glow to unit-1 source alpha.
const INNER_CLIP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
out vec4 fragColor;
void main() {
  vec4 shadow = texture(u_texture0, v_texCoord);
  float srcAlpha = texture(u_texture1, v_texCoord).a;
  fragColor = shadow * srcAlpha;
}`;

type InnerClipLocations = GlFullscreenProgram;

const clipShaders = new WeakMap<GlRenderState, InnerClipLocations>();

/**
 * Applies an inner shadow to `source`, writing the result to `dest`.
 * The shadow appears at interior edges of the source shape, offset by angle/distance.
 *
 * Algorithm:
 *   1. Invert-tint pass: extracts inverted alpha, tinted with shadow color.
 *   2. Blur pass.
 *   3. Offset pass: shifts the blurred shadow by the angle/distance.
 *   4. Clip pass: clips the offset shadow to source alpha (keeps shadow inside shape).
 *   5. Composite: source + clipped shadow.
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates nothing itself.
 */
export function applyInnerShadowFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  scratch: GlRenderTarget[],
  filter: Readonly<Omit<InnerShadowFilter, 'type'>>,
): void {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = filter.color ?? 0;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));

  const [s0, s1, s2] = scratch;

  // Pass 1: invert source alpha and tint with shadow color → s0
  applyGlInvertTintPass(state, source, s0, color, alpha, strength);

  // Pass 2: blur → s1 (s2 is ping-pong temp)
  applyBoxBlurFilterToGl(state, s0, s1, s2, { blurX: filter.blurX ?? 4, blurY: filter.blurY ?? 4, passes: quality });

  // Pass 3: shift the blurred shadow by the offset → s0 (s1 no longer needed).
  // s0 still holds pass-1 content; clear it so the offset blit doesn't blend on top of it.
  clearGlRenderTarget(state, s0);
  applyGlBlitOffsetPass(state, s1, s0, dx, dy);

  // Pass 4: clip offset shadow (s0) to source alpha → s1.
  // s1 still holds pass-2 blur content; clear it before the clip blit.
  clearGlRenderTarget(state, s1);
  applyGlInnerClipPass(state, s0, source, s1);

  // Final composite: source first, then clipped shadow on top
  clearGlRenderTarget(state, dest);
  applyGlBlitPass(state, source, dest);
  applyGlBlitPass(state, s1, dest);
}

function applyGlInnerClipPass(
  state: GlRenderState,
  shadow: GlRenderTarget,
  source: GlRenderTarget,
  dest: GlRenderTarget,
): void {
  const loc = getClipShader(state);
  drawGlFullscreenPass(state, loc, [shadow.texture, source.texture], dest, () => {});
}

function getClipShader(state: GlRenderState): InnerClipLocations {
  let loc = clipShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, INNER_CLIP_FRAGMENT_SRC);
    loc = { ...base };
    clipShaders.set(state, loc);
  }
  return loc;
}
