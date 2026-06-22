import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, LensDistortionEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Lens distortion: remap uv by a radial polynomial. Positive amount bulges outward (barrel), negative
// pinches inward (pincushion); scale re-frames the result so corners stay in view.
export function applyLensDistortionEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LensDistortionEffect>,
): void {
  const amount = effect.amount ?? 0.2;
  const scale = effect.scale ?? 1;
  const program = getGlEffectProgram(state, 'lens.lensDistortion', LENS_DISTORTION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_amount'), amount);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_scale'), scale);
  });
}

export const defaultGlLensDistortionEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LensDistortionEffect);
};

const LENS_DISTORTION_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform float u_scale;
out vec4 o_color;
void main() {
  vec2 centered = (v_texCoord - 0.5) / u_scale;
  float r2 = dot(centered, centered);
  vec2 distorted = centered * (1.0 + u_amount * r2) + 0.5;
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    o_color = texture(u_texture0, distorted);
  }
}`;
