import { drawGlFullscreenPass } from '@flighthq/render-gl/contract';
import type { DisplacementEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import { getGlEffectProgram } from './glEffectProgramCache';
import { registerGlRenderEffect } from './glRenderEffectRegistry';

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

export function registerGlDisplacementEffect(state: GlRenderState): void {
  registerGlRenderEffect(state, 'DisplacementEffect', defaultGlDisplacementEffectRunner);
}

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
  // The warp is defined in IMAGE space, which is what makes the same seed produce the same picture on
  // a bottom-left-origin target as on a top-left one. Two separate conversions are needed and they are
  // easy to mistake for one: the sine PHASE reads an image-space row, and the vertical offset is then
  // negated on the way back out, because moving down the image is moving down this target's y.
  float imageY = 1.0 - v_texCoord.y;
  vec2 warp = vec2(
    sin(imageY * f + u_seed) + sin(imageY * f * 2.3 + u_seed * 1.7) * 0.5,
    cos(v_texCoord.x * f * 0.8 + u_seed * 1.3)
  );
  vec2 offset = warp * (u_intensity / u_resolution);
  vec2 displaced = vec2(v_texCoord.x + offset.x, v_texCoord.y - offset.y);
  o_color = texture(u_texture0, displaced);
}`;
