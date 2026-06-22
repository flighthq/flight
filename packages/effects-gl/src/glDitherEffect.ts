import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { DitherEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Dither: quantize each channel to `levels` steps with a 4x4 ordered Bayer threshold for a retro
// banded-but-textured look.
export function applyDitherEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<DitherEffect>,
): void {
  const levels = effect.levels ?? 4;
  const program = getGlEffectProgram(state, 'stylization.dither', DITHER_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_levels'), Math.max(2, levels));
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlDitherEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyDitherEffectToGl(ctx.state, ctx.source, ctx.dest, effect as DitherEffect);
};

const DITHER_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
uniform vec2 u_resolution;
out vec4 o_color;
float bayer(ivec2 p) {
  int x = p.x & 3;
  int y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  ivec2 px = ivec2(v_texCoord * u_resolution);
  float t = bayer(px) - 0.5;
  float steps = u_levels - 1.0;
  vec3 q = floor(c.rgb * steps + 0.5 + t) / steps;
  o_color = vec4(clamp(q, 0.0, 1.0), c.a);
}`;
