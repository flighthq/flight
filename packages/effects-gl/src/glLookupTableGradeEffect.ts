import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, LookupTableGradeEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// LUT grade: passthrough with a strength mix. A real 3D LUT grade needs an uploaded LUT cube texture
// (size from effect.size) sampled per pixel; that texture path is not yet wired, so this keeps the
// pass compiling and color-neutral until the LUT upload is added.
export function applyLookupTableGradeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LookupTableGradeEffect>,
): void {
  const strength = effect.strength ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.lutGrade', LUT_GRADE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_strength'), strength);
  });
}

export const defaultGlLookupTableGradeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLookupTableGradeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LookupTableGradeEffect);
};

const LUT_GRADE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_strength;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  // Passthrough: a real 3D LUT samples an uploaded LUT cube here, then mixes by u_strength.
  vec3 graded = c.rgb;
  o_color = vec4(mix(c.rgb, graded, u_strength), c.a);
}`;
