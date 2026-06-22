import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, HalftoneEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Halftone: sample luminance, then carve a rotated dot grid whose dot radius tracks darkness — the
// classic print/comic screen. `scale` sets the cell size, `angle` rotates the grid.
export function applyHalftoneEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<HalftoneEffect>,
): void {
  const scale = effect.scale ?? 6;
  const angle = effect.angle ?? 0.4;
  const program = getGlEffectProgram(state, 'stylization.halftone', HALFTONE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_scale'), Math.max(1, scale));
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_angle'), angle);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlHalftoneEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyHalftoneEffectToGl(ctx.state, ctx.source, ctx.dest, effect as HalftoneEffect);
};

const HALFTONE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_scale;
uniform float u_angle;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 p = v_texCoord * u_resolution;
  float s = sin(u_angle), co = cos(u_angle);
  vec2 rp = vec2(p.x * co - p.y * s, p.x * s + p.y * co);
  vec2 cell = mod(rp, u_scale) - u_scale * 0.5;
  float dist = length(cell) / (u_scale * 0.5);
  float radius = sqrt(1.0 - lum);
  float dot1 = step(dist, radius);
  o_color = vec4(c.rgb * dot1, c.a);
}`;
