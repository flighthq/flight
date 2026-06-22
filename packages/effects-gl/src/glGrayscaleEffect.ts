import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, GrayscaleEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Grayscale: mix toward luminance by intensity.
export function applyGrayscaleEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<GrayscaleEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.grayscale', GRAYSCALE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

export const defaultGlGrayscaleEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGrayscaleEffectToGl(ctx.state, ctx.source, ctx.dest, effect as GrayscaleEffect);
};

const GRAYSCALE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  o_color = vec4(mix(c.rgb, vec3(l), u_intensity), c.a);
}`;
