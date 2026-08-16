import { acquireGlRenderTarget, drawGlFullscreenPass, releaseGlRenderTarget } from '@flighthq/render-gl/contract';
import type {
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
  LensDirtEffect,
} from '@flighthq/types/contract';

import { applyGaussianBlurToGl } from './glBlurEffect';
import { getGlEffectProgram } from './glEffectProgramCache';
import { registerGlRenderEffect } from './glRenderEffectRegistry';

// Lens dirt: isolate bright energy, spread it spatially, then admit it through a procedural smudge mask.
// The bright branch must blur before the mask: masking only the source pixel cannot carry any energy
// into the dark background, reducing this spatial effect to a pointwise highlight boost.
export function applyLensDirtEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<LensDirtEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const threshold = effect.threshold ?? 0.55;
  const seed = effect.seed ?? 0;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const bright = acquireGlRenderTarget(state, pool, descriptor);
  const blurred = acquireGlRenderTarget(state, pool, descriptor);
  const temp = acquireGlRenderTarget(state, pool, descriptor);

  const brightProgram = getGlEffectProgram(state, 'lens.lensDirt.bright', LENS_DIRT_BRIGHT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, brightProgram, [source.texture], bright, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
  });

  applyGaussianBlurToGl(state, bright, blurred, temp, {
    blurX: LENS_DIRT_BLUR_SIGMA,
    blurY: LENS_DIRT_BLUR_SIGMA,
  });

  const compositeProgram = getGlEffectProgram(state, 'lens.lensDirt.composite', LENS_DIRT_COMPOSITE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, compositeProgram, [source.texture, blurred.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
  });

  releaseGlRenderTarget(pool, bright);
  releaseGlRenderTarget(pool, blurred);
  releaseGlRenderTarget(pool, temp);
}

export const defaultGlLensDirtEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as LensDirtEffect);
};

export function registerGlLensDirtEffect(state: GlRenderState): void {
  registerGlRenderEffect(state, 'LensDirtEffect', defaultGlLensDirtEffectRunner);
}

const LENS_DIRT_BRIGHT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float bright = max(0.0, lum - u_threshold);
  o_color = vec4(c.rgb * (bright / max(lum, 0.00001)), c.a);
}`;

const LENS_DIRT_COMPOSITE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_intensity;
uniform float u_seed;
out vec4 o_color;
float dirtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float dirtAmount(vec2 uv, float seed) {
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 c = vec2(dirtHash(vec2(fi, seed)), dirtHash(vec2(fi + 9.0, seed)));
    float r = 0.06 + 0.16 * dirtHash(vec2(fi + 3.0, seed));
    float d = distance(uv, c) / r;
    acc += smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  vec3 bright = texture(u_texture1, v_texCoord).rgb;
  float dirt = dirtAmount(v_texCoord, u_seed + 1.0);
  o_color = vec4(scene.rgb + bright * dirt * u_intensity * 2.0, scene.a);
}`;

// Lens dirt is a broad optical contamination layer; sigma 8 matches the default bloom spread while
// keeping its extent independent from the procedural blob sizes, which control the mask rather than light transport.
const LENS_DIRT_BLUR_SIGMA = 8;
