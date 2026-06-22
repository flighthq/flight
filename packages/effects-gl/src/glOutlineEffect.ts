import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, OutlineEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Outline: Sobel edge detection on luminance; where the gradient magnitude exceeds `threshold`, mix
// the pixel toward the outline color by `thickness`. Color arrives packed RGBA, unpacked to 0..1 here.
export function applyOutlineEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<OutlineEffect>,
): void {
  const threshold = effect.threshold ?? 0.2;
  const thickness = effect.thickness ?? 1;
  const color = effect.color ?? 0x000000ff;
  const program = getGlEffectProgram(state, 'stylization.outline', OUTLINE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_thickness'), thickness);
    gl.uniform4f(
      gl.getUniformLocation(p.program, 'u_color'),
      ((color >>> 24) & 0xff) / 255,
      ((color >>> 16) & 0xff) / 255,
      ((color >>> 8) & 0xff) / 255,
      (color & 0xff) / 255,
    );
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlOutlineEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyOutlineEffectToGl(ctx.state, ctx.source, ctx.dest, effect as OutlineEffect);
};

const OUTLINE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_thickness;
uniform vec4 u_color;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = u_thickness / u_resolution;
  float tl = lum(v_texCoord + texel * vec2(-1.0, -1.0));
  float t = lum(v_texCoord + texel * vec2(0.0, -1.0));
  float tr = lum(v_texCoord + texel * vec2(1.0, -1.0));
  float l = lum(v_texCoord + texel * vec2(-1.0, 0.0));
  float rr = lum(v_texCoord + texel * vec2(1.0, 0.0));
  float bl = lum(v_texCoord + texel * vec2(-1.0, 1.0));
  float b = lum(v_texCoord + texel * vec2(0.0, 1.0));
  float br = lum(v_texCoord + texel * vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  vec4 c = texture(u_texture0, v_texCoord);
  float k = step(u_threshold, edge);
  o_color = mix(c, u_color, k * u_color.a);
}`;
