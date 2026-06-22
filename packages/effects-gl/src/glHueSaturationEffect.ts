import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, HueSaturationEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Hue/saturation/lightness: convert to HSL, adjust, convert back.
export function applyHueSaturationEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<HueSaturationEffect>,
): void {
  const hue = effect.hue ?? 0;
  const saturation = effect.saturation ?? 1;
  const lightness = effect.lightness ?? 0;
  const program = getGlEffectProgram(state, 'colorGrade.hueSaturation', HUE_SATURATION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hue'), hue / 360);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_saturation'), saturation);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_lightness'), lightness);
  });
}

export const defaultGlHueSaturationEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyHueSaturationEffectToGl(ctx.state, ctx.source, ctx.dest, effect as HueSaturationEffect);
};

const HUE_SATURATION_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_hue;
uniform float u_saturation;
uniform float u_lightness;
out vec4 o_color;
vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = mx - mn;
  if (d > 0.0001) {
    s = l < 0.5 ? d / (mx + mn) : d / (2.0 - mx - mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + u_hue);
  hsl.y = clamp(hsl.y * u_saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_lightness, 0.0, 1.0);
  o_color = vec4(hsl2rgb(hsl), c.a);
}`;
