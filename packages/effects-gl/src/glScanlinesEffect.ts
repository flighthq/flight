import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, ScanlinesEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Scanlines: darken by a vertical sine band; `count` sets the line density, `intensity` the darkening.
export function applyScanlinesEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ScanlinesEffect>,
): void {
  const count = effect.count ?? 240;
  const intensity = effect.intensity ?? 0.3;
  const program = getGlEffectProgram(state, 'stylization.scanlines', SCANLINES_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_count'), count);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

export const defaultGlScanlinesEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyScanlinesEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ScanlinesEffect);
};

const SCANLINES_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_count;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float line = sin(v_texCoord.y * u_count * 3.14159265) * 0.5 + 0.5;
  o_color = vec4(c.rgb * (1.0 - u_intensity * (1.0 - line)), c.a);
}`;
