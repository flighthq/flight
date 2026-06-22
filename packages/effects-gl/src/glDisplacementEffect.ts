import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { DisplacementEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Displacement / heat-haze: warp the sample uv by an animated sine field for a refractive wobble.
export function applyDisplacementEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<DisplacementEffect>,
): void {
  const intensity = effect.intensity ?? 8;
  const frequency = effect.frequency ?? 12;
  const seed = effect.seed ?? 0;
  const program = getGlEffectProgram(state, 'lens.displacement', DISPLACEMENT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_frequency'), frequency);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlDisplacementEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyDisplacementEffectToGl(ctx.state, ctx.source, ctx.dest, effect as DisplacementEffect);
};

const DISPLACEMENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_frequency;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  float f = u_frequency;
  vec2 warp = vec2(
    sin(v_texCoord.y * f + u_seed) + sin(v_texCoord.y * f * 2.3 + u_seed * 1.7) * 0.5,
    cos(v_texCoord.x * f * 0.8 + u_seed * 1.3)
  );
  vec2 displaced = v_texCoord + warp * (u_intensity / u_resolution);
  o_color = texture(u_texture0, displaced);
}`;
