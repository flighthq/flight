import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, TiltShiftEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Tilt-shift: keep a horizontal focus band sharp and blur above and below it. The band is centered at
// `center` on Y with height `width`; blur strength ramps with distance outside the band. Blur is
// approximated by averaging a few neighbor taps using the pixel size from u_resolution.
export function applyTiltShiftEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<TiltShiftEffect>,
): void {
  const center = effect.center ?? 0.5;
  const width = effect.width ?? 0.3;
  const blur = effect.blur ?? 4;
  const program = getGlEffectProgram(state, 'lens.tiltShift', TILT_SHIFT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_center'), center);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_width'), width);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_blur'), blur);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlTiltShiftEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToGl(ctx.state, ctx.source, ctx.dest, effect as TiltShiftEffect);
};

const TILT_SHIFT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_center;
uniform float u_width;
uniform float u_blur;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  float dist = abs(v_texCoord.y - u_center);
  float edge = u_width * 0.5;
  float amount = smoothstep(edge, edge + u_width, dist);
  float radius = amount * u_blur;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 offset = vec2(0.0, float(i)) * radius * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}`;
