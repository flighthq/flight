import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, PosterizeEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Posterize: floor each channel to `levels` discrete steps.
export function applyPosterizeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<PosterizeEffect>,
): void {
  const levels = Math.max(2, effect.levels ?? 8);
  const program = getGlEffectProgram(state, 'colorGrade.posterize', POSTERIZE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_levels'), levels);
  });
}

export const defaultGlPosterizeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as PosterizeEffect);
};

const POSTERIZE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = floor(c.rgb * u_levels) / (u_levels - 1.0);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;
