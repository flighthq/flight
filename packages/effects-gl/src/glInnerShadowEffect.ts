import {
  acquireGlRenderTarget,
  clearGlRenderTarget,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  releaseGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  InnerShadowEffect,
  GlFullscreenProgram,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGlEffectBlitOffsetPass, applyGlEffectBlitPass } from './glEffectBlitShader';
import { applyGlEffectBoxBlur } from './glEffectBoxBlur';
import { applyGlEffectInvertTintPass } from './glEffectTintShader';

// Why: all filter passes use ONE/ONE_MINUS_SRC_ALPHA premultiplied blending — they never
// implicitly clear their destination. Reusing a scratch target without clearing first means
// the previous pass's content bleeds through wherever the new pass's alpha is 0. Clearing
// before each reuse gives clean replacement semantics.

// Same clip shader as innerGlow — clips unit-0 glow to unit-1 source alpha.
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

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them.
//
// Algorithm:
//   1. Invert-tint pass: extracts inverted alpha, tinted with shadow color.
//   2. Blur pass.
//   3. Offset pass: shifts the blurred shadow by the angle/distance.
//   4. Clip pass: clips the offset shadow to source alpha (keeps shadow inside shape).
//   5. Composite: source (unless sourceMode is 'hide') + clipped shadow.
export function applyInnerShadowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<InnerShadowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = effect.color ?? 0;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';

  // Pass 1: invert source alpha and tint with shadow color → s0
  applyGlEffectInvertTintPass(state, src, s0, color, alpha, strength);

  // Pass 2: blur → s1 (s2 is ping-pong temp)
  applyGlEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    edgeColor: getInvertTintEdgeColor(color, alpha, strength),
    passes: quality,
  });

  // Pass 3: shift the blurred shadow by the offset → s0 (s1 no longer needed).
  // s0 still holds pass-1 content; clear it so the offset blit doesn't blend on top of it.
  clearGlRenderTarget(state, s0);
  applyGlEffectBlitOffsetPass(state, s1, s0, dx, dy);

  // Pass 4: clip offset shadow (s0) to source alpha → s1.
  // s1 still holds pass-2 blur content; clear it before the clip blit.
  clearGlRenderTarget(state, s1);
  applyGlInnerClipPass(state, s0, src, s1);

  // Final composite: source first, unless hidden, then clipped shadow on top.
  clearGlRenderTarget(state, dst);
  if (sourceMode === 'draw') {
    applyGlEffectBlitPass(state, src, dst);
  }
  applyGlEffectBlitPass(state, s1, dst);

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlInnerShadowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyInnerShadowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerShadowEffect);
};

function applyGlInnerClipPass(
  state: GlRenderState,
  shadow: GlRenderTarget,
  source: GlRenderTarget,
  dest: GlRenderTarget,
): void {
  const loc = getClipShader(state);
  drawGlFullscreenPass(state, loc, [shadow.texture, source.texture], dest, (gl) => {
    gl.blendFunc(gl.ONE, gl.ZERO);
  });
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

function getInvertTintEdgeColor(
  color: number,
  alpha: number,
  strength: number,
): readonly [number, number, number, number] {
  const edgeAlpha = Math.min(1, alpha * strength);
  return [
    (((color >> 16) & 0xff) / 255) * edgeAlpha,
    (((color >> 8) & 0xff) / 255) * edgeAlpha,
    ((color & 0xff) / 255) * edgeAlpha,
    edgeAlpha,
  ];
}
