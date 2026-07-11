import {
  acquireGlRenderTarget,
  clearGlRenderTarget,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  releaseGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  GradientGlowEffect,
  GlFullscreenProgram,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGlEffectBlitPass } from './glEffectBlitShader';
import { applyGlEffectBoxBlur } from './glEffectBoxBlur';
import { createGlEffectGradientRampTexture } from './glEffectGradientRamp';
import { applyGlEffectTintPass } from './glEffectTintShader';

// Uses the blurred alpha (unit 0) to index into a gradient ramp texture (unit 1).
// Outputs the gradient-colored glow at the correct intensity per pixel.
const GRADIENT_LOOKUP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
out vec4 fragColor;
void main() {
  float alpha = texture(u_texture, v_texCoord).a;
  fragColor = texture(u_ramp, vec2(alpha, 0.5));
}`;

type GradientLookupLocations = GlFullscreenProgram & {
  locRamp: WebGLUniformLocation;
};

const lookupShaders = new WeakMap<GlRenderState, GradientLookupLocations>();

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them. The gradient ramp is built each call from
// `effect.colors`, `effect.alphas`, and `effect.ratios` (a temporary `WebGLTexture` per call).
//
// Compositing order: gradient glow → source on top.
export function applyGradientGlowEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<GradientGlowEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const strength = effect.strength ?? 1;

  const gl = state.gl;

  // Extract alpha as a neutral (white) mask, then blur → s1
  applyGlEffectTintPass(state, src, s0, 0xffffff, 1, Math.min(1, strength));
  applyGlEffectBoxBlur(state, s0, s1, s2, { blurX: effect.blurX ?? 6, blurY: effect.blurY ?? 6, passes: quality });

  // Build gradient ramp texture and look up the blurred alpha → s0
  const ramp = createGlEffectGradientRampTexture(gl, effect.colors, effect.alphas, effect.ratios);
  applyGradientLookupPass(state, s1, ramp, s0);
  gl.deleteTexture(ramp);

  clearGlRenderTarget(state, dst);
  applyGlEffectBlitPass(state, s0, dst);
  applyGlEffectBlitPass(state, src, dst);

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlGradientGlowEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGradientGlowEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as GradientGlowEffect);
};

function applyGradientLookupPass(
  state: GlRenderState,
  blurred: GlRenderTarget,
  ramp: WebGLTexture,
  dest: GlRenderTarget,
): void {
  const loc = getLookupShader(state);
  drawGlFullscreenPass(state, loc, [blurred.texture], dest, (gl) => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.uniform1i(loc.locRamp, 1);
    gl.activeTexture(gl.TEXTURE0);
  });
}

function getLookupShader(state: GlRenderState): GradientLookupLocations {
  let loc = lookupShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, GRADIENT_LOOKUP_FRAGMENT_SRC);
    loc = { ...base, locRamp: gl.getUniformLocation(base.program, 'u_ramp')! };
    lookupShaders.set(state, loc);
  }
  return loc;
}
