import {
  acquireGlRenderTarget,
  clearGlRenderTarget,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  releaseGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  GradientBevelEffect,
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

// Samples the blurred alpha at +offset and -offset to compute a bevel value
// in [-1, 1], mapped to [0, 1] for gradient lookup. Outputs the encoded
// bevel value in the red channel; alpha=1 (will be clipped later).
const BEVEL_ENCODE_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_offset;
out vec4 fragColor;
void main() {
  float high = texture(u_texture, v_texCoord - u_offset).a;
  float low = texture(u_texture, v_texCoord + u_offset).a;
  float bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  fragColor = vec4(bevelVal, 0.0, 0.0, 1.0);
}`;

// Looks up the encoded bevel value (in .r) in the gradient ramp and clips
// the result to the source alpha (unit 1 holds the source).
const BEVEL_APPLY_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
uniform sampler2D u_source;
out vec4 fragColor;
void main() {
  float bevelVal = texture(u_texture, v_texCoord).r;
  vec4 color = texture(u_ramp, vec2(bevelVal, 0.5));
  float srcAlpha = texture(u_source, v_texCoord).a;
  fragColor = color * srcAlpha;
}`;

type BevelEncodeLocations = GlFullscreenProgram & {
  locOffset: WebGLUniformLocation;
};

type BevelApplyLocations = GlFullscreenProgram & {
  locRamp: WebGLUniformLocation;
  locSource: WebGLUniformLocation;
};

const encodeShaders = new WeakMap<GlRenderState, BevelEncodeLocations>();
const applyShaders = new WeakMap<GlRenderState, BevelApplyLocations>();

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them. The gradient maps bevel depth (shadow edge →
// highlight edge) to colors, building a temporary `WebGLTexture` per call.
export function applyGradientBevelEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<GradientBevelEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const strength = effect.strength ?? 1;

  const gl = state.gl;

  // Build blur basis → s1
  applyGlEffectTintPass(state, src, s0, 0xffffff, 1, Math.min(1, strength));
  applyGlEffectBoxBlur(state, s0, s1, s2, { blurX: effect.blurX ?? 4, blurY: effect.blurY ?? 4, passes: quality });

  // Encode bevel value from blurred alpha offset samples → s0.
  // The Y offset is negated because render targets are bottom-left origin (V-flipped vs image space),
  // so an image-space downward light direction maps to a negative texel-V offset — matching glBevelEffect.
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  applyBevelEncodePass(state, s1, s0, dx / s1.width, -dy / s1.height);

  // Build gradient ramp, apply to encoded bevel value clipped to source alpha → s1
  const ramp = createGlEffectGradientRampTexture(gl, effect.colors, effect.alphas, effect.ratios);
  applyBevelApplyPass(state, s0, ramp, src, s1);
  gl.deleteTexture(ramp);

  clearGlRenderTarget(state, dst);
  if (!(effect.bevelType && effect.bevelType !== 'full')) {
    applyGlEffectBlitPass(state, src, dst);
  }
  applyGlEffectBlitPass(state, s1, dst);

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlGradientBevelEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGradientBevelEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as GradientBevelEffect);
};

function applyBevelApplyPass(
  state: GlRenderState,
  encoded: GlRenderTarget,
  ramp: WebGLTexture,
  source: GlRenderTarget,
  dest: GlRenderTarget,
): void {
  const loc = getApplyShader(state);
  drawGlFullscreenPass(state, loc, [encoded.texture], dest, (gl) => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.uniform1i(loc.locRamp, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(loc.locSource, 2);
    gl.activeTexture(gl.TEXTURE0);
  });
}

function applyBevelEncodePass(
  state: GlRenderState,
  blurred: GlRenderTarget,
  dest: GlRenderTarget,
  dx: number,
  dy: number,
): void {
  const loc = getEncodeShader(state);
  drawGlFullscreenPass(state, loc, [blurred.texture], dest, (gl) => {
    gl.uniform2f(loc.locOffset, dx, dy);
  });
}

function getApplyShader(state: GlRenderState): BevelApplyLocations {
  let loc = applyShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, BEVEL_APPLY_FRAGMENT_SRC);
    loc = {
      ...base,
      locRamp: gl.getUniformLocation(base.program, 'u_ramp')!,
      locSource: gl.getUniformLocation(base.program, 'u_source')!,
    };
    applyShaders.set(state, loc);
  }
  return loc;
}

function getEncodeShader(state: GlRenderState): BevelEncodeLocations {
  let loc = encodeShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, BEVEL_ENCODE_FRAGMENT_SRC);
    loc = { ...base, locOffset: gl.getUniformLocation(base.program, 'u_offset')! };
    encodeShaders.set(state, loc);
  }
  return loc;
}
