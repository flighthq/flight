import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, SepiaEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Sepia: mix toward a sepia matrix transform by intensity.
export function applySepiaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SepiaEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.sepia', SEPIA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

export const defaultGlSepiaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySepiaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SepiaEffect);
};

const SEPIA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 sepia = vec3(
    dot(c.rgb, vec3(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3(0.272, 0.534, 0.131))
  );
  o_color = vec4(mix(c.rgb, sepia, u_intensity), c.a);
}`;
