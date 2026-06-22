import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { BrightnessContrastEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Brightness/contrast: shift then scale about mid-grey.
export function applyBrightnessContrastEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<BrightnessContrastEffect>,
): void {
  const brightness = effect.brightness ?? 0;
  const contrast = effect.contrast ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.brightnessContrast', BRIGHTNESS_CONTRAST_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_brightness'), brightness);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_contrast'), contrast);
  });
}

export const defaultGlBrightnessContrastEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBrightnessContrastEffectToGl(ctx.state, ctx.source, ctx.dest, effect as BrightnessContrastEffect);
};

const BRIGHTNESS_CONTRAST_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_brightness;
uniform float u_contrast;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = (c.rgb + u_brightness - 0.5) * u_contrast + 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;
