import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { FilmGrainEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Film grain: add per-pixel hash noise scaled by intensity, with grain cell size and a seed so the
// noise can be animated frame to frame.
export function applyFilmGrainEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<FilmGrainEffect>,
): void {
  const intensity = effect.intensity ?? 0.1;
  const size = effect.size ?? 1;
  const seed = effect.seed ?? 0;
  const program = getGlEffectProgram(state, 'stylization.filmGrain', FILM_GRAIN_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_size'), Math.max(0.0001, size));
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
  });
}

export const defaultGlFilmGrainEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyFilmGrainEffectToGl(ctx.state, ctx.source, ctx.dest, effect as FilmGrainEffect);
};

const FILM_GRAIN_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_size;
uniform float u_seed;
out vec4 o_color;
float hash(vec2 p) {
  p = floor(p / u_size);
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453123);
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float n = hash(v_texCoord * 1024.0) - 0.5;
  o_color = vec4(c.rgb + n * u_intensity, c.a);
}`;
