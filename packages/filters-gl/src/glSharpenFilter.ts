import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlFullscreenProgram, GlRenderState, SharpenFilter } from '@flighthq/types';

import { applyBoxBlurFilterToGl } from './glBlurFilter';

// Unsharp mask: sharpened = source + (source - blurred) * amount.
// source0 = original source (unit 0), source1 = blurred (unit 1).
const SHARPEN_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_amount;
out vec4 fragColor;
void main() {
  vec4 src = texture(u_texture0, v_texCoord);
  vec4 blurred = texture(u_texture1, v_texCoord);
  fragColor = clamp(src + (src - blurred) * u_amount, 0.0, 1.0);
}`;

type SharpenShaderLocations = GlFullscreenProgram & {
  locAmount: WebGLUniformLocation;
};

const shaders = new WeakMap<GlRenderState, SharpenShaderLocations>();

/**
 * Sharpens `source` using an unsharp mask, writing to `dest`. `blurX`/`blurY`
 * are Gaussian standard deviations of the mask blur; `amount` controls strength.
 *
 * `scratch` must contain two render targets: one for the blurred image and one
 * for the blur's ping-pong temp. The filter allocates nothing itself.
 */
export function applySharpenFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  scratch: GlRenderTarget[],
  filter: Readonly<Omit<SharpenFilter, 'kind'>>,
): void {
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const amount = filter.amount ?? 1;

  const [blurred, blurTemp] = scratch;

  applyBoxBlurFilterToGl(state, source, blurred, blurTemp, {
    blurX: filter.blurX ?? 2,
    blurY: filter.blurY ?? 2,
    passes: quality,
  });

  const loc = getShader(state);
  // source is unit 0, blurred is unit 1
  drawGlFullscreenPass(state, loc, [source.texture, blurred.texture], dest, (gl) => {
    gl.uniform1f(loc.locAmount, amount);
  });
}

function getShader(state: GlRenderState): SharpenShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, SHARPEN_FRAGMENT_SRC);
    loc = {
      ...base,
      locAmount: gl.getUniformLocation(base.program, 'u_amount')!,
    };
    shaders.set(state, loc);
  }
  return loc;
}
