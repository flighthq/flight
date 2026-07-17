import type { GlFullscreenProgram, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { compileGlFullscreenProgram, drawGlFullscreenPass } from './glFullscreenPass';

// The linear->sRGB OETF present pass: encode a linear render-target texture into display sRGB as a
// fullscreen pass. scene-gl materials write linear HDR radiance into an rgba16f target and tonemap
// (when present) is a linear HDR->LDR step BEFORE this, so a caller who draws linear content must end
// with one encode or the canvas receives raw-linear (dark) pixels. presentGlScene ends the no-effects
// 3D path with exactly this pass. Keep this the single linear->sRGB seam for content that routes
// through it: encode once at present, never inside a per-material fragment shader.
//
// The transfer is the IEC 61966-2-1 sRGB OETF, matching linearChannelToSrgb in @flighthq/color
// channel-for-channel (12.92*c below 0.0031308, else 1.055*c^(1/2.4)-0.055). RGB is encoded; alpha is
// linear coverage and passes through unchanged. Inputs are clamped to >= 0 so a stray negative texel
// cannot feed pow() a NaN.
export function drawGlLinearToSrgbPass(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget> | null,
): void {
  drawGlFullscreenPass(state, getGlLinearToSrgbProgram(state), [source.texture], dest, NOOP);
}

function getGlLinearToSrgbProgram(state: GlRenderState): GlFullscreenProgram {
  let program = _programs.get(state);
  if (program === undefined) {
    program = compileGlFullscreenProgram(state.gl, LINEAR_TO_SRGB_FRAGMENT_SRC);
    _programs.set(state, program);
  }
  return program;
}

const NOOP = (): void => {};

// Per-state compiled OETF program, kept off the render-state runtime type and freed with the state.
const _programs = new WeakMap<GlRenderState, GlFullscreenProgram>();

export const LINEAR_TO_SRGB_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 fragColor;
vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), c));
}
void main() {
  vec4 linear = texture(u_texture0, v_texCoord);
  fragColor = vec4(linearToSrgb(linear.rgb), linear.a);
}`;
