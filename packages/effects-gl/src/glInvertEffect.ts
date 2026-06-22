import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, InvertEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Invert: mix toward 1 - rgb by intensity.
export function applyInvertEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<InvertEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.invert', INVERT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

export const defaultGlInvertEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyInvertEffectToGl(ctx.state, ctx.source, ctx.dest, effect as InvertEffect);
};

const INVERT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  o_color = vec4(mix(c.rgb, 1.0 - c.rgb, u_intensity), c.a);
}`;
