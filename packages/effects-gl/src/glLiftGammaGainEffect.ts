import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, LiftGammaGainEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Lift/gamma/gain: unpack packed-RGBA neutrals to per-channel offsets/exponents/multipliers in JS.
// Neutral packed values: lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff.
export function applyLiftGammaGainEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LiftGammaGainEffect>,
): void {
  const lift = unpackColor(effect.lift ?? 0x000000ff);
  const gammaRaw = unpackColor(effect.gamma ?? 0x808080ff);
  const gain = unpackColor(effect.gain ?? 0xffffffff);
  // Map gamma's 0.5-neutral to a 1.0-neutral exponent so 0x808080 leaves the image unchanged.
  const gamma: readonly [number, number, number] = [
    1 / Math.max(gammaRaw[0] * 2, 1e-3),
    1 / Math.max(gammaRaw[1] * 2, 1e-3),
    1 / Math.max(gammaRaw[2] * 2, 1e-3),
  ];
  const program = getGlEffectProgram(state, 'colorGrade.liftGammaGain', LIFT_GAMMA_GAIN_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_lift'), lift[0], lift[1], lift[2]);
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_gamma'), gamma[0], gamma[1], gamma[2]);
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_gain'), gain[0], gain[1], gain[2]);
  });
}

export const defaultGlLiftGammaGainEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLiftGammaGainEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LiftGammaGainEffect);
};

// Unpack a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b] floats. Alpha is dropped — these
// grade values describe RGB channels only.
function unpackColor(c: number): readonly [number, number, number] {
  return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255];
}

const LIFT_GAMMA_GAIN_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb * u_gain + u_lift * (1.0 - c.rgb);
  rgb = pow(max(rgb, 0.0), u_gamma);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;
