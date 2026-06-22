import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, VignetteEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Vignette: darken toward the edges. Pixels inside `radius` stay full bright; beyond it, brightness
// falls off over `softness` and the color is blended toward the (unpacked) vignette color by intensity.
export function applyVignetteEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<VignetteEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const radius = effect.radius ?? 0.75;
  const softness = effect.softness ?? 0.45;
  const color = effect.color ?? 0x000000ff;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  const program = getGlEffectProgram(state, 'lens.vignette', VIGNETTE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radius'), radius);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_softness'), softness);
    gl.uniform4f(gl.getUniformLocation(p.program, 'u_color'), r, g, b, a);
  });
}

export const defaultGlVignetteEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToGl(ctx.state, ctx.source, ctx.dest, effect as VignetteEffect);
};

const VIGNETTE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radius;
uniform float u_softness;
uniform vec4 u_color;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec2 centered = v_texCoord - 0.5;
  float dist = length(centered) * 1.41421356;
  float vig = smoothstep(u_radius, u_radius - u_softness, dist);
  float darken = (1.0 - vig) * u_intensity * u_color.a;
  o_color = vec4(mix(c.rgb, u_color.rgb, darken), c.a);
}`;
