import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, LensDirtEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Lens dirt: procedural soft smudges that brighten where the scene is bright — a cheap bloom-dirt overlay.
export function applyLensDirtEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LensDirtEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const threshold = effect.threshold ?? 0.55;
  const seed = effect.seed ?? 0;
  const program = getGlEffectProgram(state, 'lens.lensDirt', LENS_DIRT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
  });
}

export const defaultGlLensDirtEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LensDirtEffect);
};

const LENS_DIRT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_threshold;
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
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float bright = max(0.0, lum - u_threshold);
  float dirt = dirtAmount(v_texCoord, u_seed + 1.0);
  o_color = vec4(c.rgb + bright * dirt * u_intensity * 2.0, c.a);
}`;
