import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ColorGradeEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Color grade: combined exposure, brightness, contrast, saturation, and temperature/tint shift.
export function applyColorGradeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ColorGradeEffect>,
): void {
  const exposure = effect.exposure ?? 0;
  const contrast = effect.contrast ?? 1;
  const saturation = effect.saturation ?? 1;
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const brightness = effect.brightness ?? 0;
  const program = getGlEffectProgram(state, 'colorGrade.colorGrade', COLOR_GRADE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), Math.pow(2, exposure));
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_contrast'), contrast);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_saturation'), saturation);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_temperature'), temperature);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_tint'), tint);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_brightness'), brightness);
  });
}

export const defaultGlColorGradeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyColorGradeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ColorGradeEffect);
};

const COLOR_GRADE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_tint;
uniform float u_brightness;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb * u_exposure + u_brightness;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  float l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(l), rgb, u_saturation);
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;
