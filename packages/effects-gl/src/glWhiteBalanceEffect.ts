import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, WhiteBalanceEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// White balance: warm/cool temperature and magenta/green tint channel shift.
export function applyWhiteBalanceEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<WhiteBalanceEffect>,
): void {
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const program = getGlEffectProgram(state, 'colorGrade.whiteBalance', WHITE_BALANCE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_temperature'), temperature);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_tint'), tint);
  });
}

export const defaultGlWhiteBalanceEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyWhiteBalanceEffectToGl(ctx.state, ctx.source, ctx.dest, effect as WhiteBalanceEffect);
};

const WHITE_BALANCE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_temperature;
uniform float u_tint;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;
