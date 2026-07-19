import {
  acquireGlRenderTarget,
  clearGlRenderTarget,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  releaseGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  InnerGlowEffect,
  GlFullscreenProgram,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGlEffectBlitPass } from './glEffectBlitShader';
import { applyGlEffectBoxBlur } from './glEffectBoxBlur';
import { applyGlEffectInvertTintPass } from './glEffectTintShader';

// Why: all filter passes use ONE/ONE_MINUS_SRC_ALPHA premultiplied blending — they never
// implicitly clear their destination. Reusing a scratch target without clearing first means
// the previous pass's content bleeds through wherever the new pass's alpha is 0 (i.e. the
// exterior of the shape). Clearing before each reuse gives clean replacement semantics.

// Clips unit-0 (blurred inverted-alpha mask) to the source alpha from unit-1.
// The blurred inverted alpha is highest near interior edges; clipping to
// source alpha removes any glow that spilled outside the shape boundary.
const INNER_CLIP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
out vec4 fragColor;
void main() {
  vec4 glow = texture(u_texture0, v_texCoord);
  float srcAlpha = texture(u_texture1, v_texCoord).a;
  fragColor = glow * srcAlpha;
}`;

type InnerClipLocations = GlFullscreenProgram;

const clipShaders = new WeakMap<GlRenderState, InnerClipLocations>();

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then composite over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them.
//
// Algorithm:
//   1. Invert-tint pass: extracts inverted alpha, tinted with glow color.
//   2. Blur pass: spreads the inverted tint toward the interior.
//   3. Clip pass: multiplies the blurred glow by the source alpha to confine it inside the shape.
//   4. Composite: source (unless sourceMode is 'hide') + clipped glow.
export function applyInnerGlowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<InnerGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

  const color = effect.color ?? 0xff0000;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';

  // Pass 1: invert source alpha and tint with glow color → s0
  applyGlEffectInvertTintPass(state, src, s0, color, alpha, strength);

  // Pass 2: blur → s1 (s2 is ping-pong temp)
  applyGlEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 6,
    blurY: effect.blurY ?? 6,
    edgeColor: getInvertTintEdgeColor(color, alpha, strength),
    passes: quality,
  });

  // Pass 3: clip blurred glow (s1) to source alpha, output to s0 (s1 no longer needed).
  // s0 still holds pass-1 content; clear it so the blend doesn't retain the exterior red.
  clearGlRenderTarget(state, s0);
  applyGlInnerClipPass(state, s1, src, s0);

  // Final composite: source first, unless hidden, then clipped glow on top.
  clearGlRenderTarget(state, dst);
  if (sourceMode === 'draw') {
    applyGlEffectBlitPass(state, src, dst);
  }
  applyGlEffectBlitPass(state, s0, dst);

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlInnerGlowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyInnerGlowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerGlowEffect);
};

function applyGlInnerClipPass(
  state: GlRenderState,
  glow: GlRenderTarget,
  source: GlRenderTarget,
  dest: GlRenderTarget,
): void {
  const loc = getClipShader(state);
  drawGlFullscreenPass(state, loc, [glow.texture, source.texture], dest, (gl) => {
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
