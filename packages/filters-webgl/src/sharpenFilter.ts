import type { WebGLRenderStateInternal, WebGLRenderTarget } from '@flighthq/render-webgl';
import type { SharpenFilter } from '@flighthq/types';
import type { WebGLRenderState } from '@flighthq/types';

import { applyBoxBlurFilterToWebGL } from './blurFilter';
import type { WebGLDualSourceLocations } from './filterPass';
import { compileWebGLFilterProgram, drawWebGLDualSourcePass } from './filterPass';

// Unsharp mask: sharpened = source + (source - blurred) * amount.
// source0 = original source (unit 0), source1 = blurred (unit 1).
const SHARPEN_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_texture2;
uniform float u_amount;
out vec4 fragColor;
void main() {
  vec4 src = texture(u_texture, v_texCoord);
  vec4 blurred = texture(u_texture2, v_texCoord);
  fragColor = clamp(src + (src - blurred) * u_amount, 0.0, 1.0);
}`;

type SharpenShaderLocations = WebGLDualSourceLocations & {
  locAmount: WebGLUniformLocation;
};

const shaders = new WeakMap<WebGLRenderState, SharpenShaderLocations>();

/**
 * Sharpens `source` using an unsharp mask, writing to `dest`. `blurX`/`blurY`
 * are Gaussian standard deviations of the mask blur; `amount` controls strength.
 *
 * `scratch` must contain two render targets: one for the blurred image and one
 * for the blur's ping-pong temp. The filter allocates nothing itself.
 */
export function applySharpenFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  filter: Readonly<Omit<SharpenFilter, 'type'>>,
): void {
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const amount = filter.amount ?? 1;

  const [blurred, blurTemp] = scratch;

  applyBoxBlurFilterToWebGL(state, source, blurred, blurTemp, {
    blurX: filter.blurX ?? 2,
    blurY: filter.blurY ?? 2,
    passes: quality,
  });

  const loc = getShader(state);
  // source is unit 0, blurred is unit 1
  drawWebGLDualSourcePass(state, source, blurred, dest, loc, (gl) => {
    gl.uniform1f(loc.locAmount, amount);
  });
}

function getShader(state: WebGLRenderState): SharpenShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, SHARPEN_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexture2: gl.getUniformLocation(base.program, 'u_texture2')!,
      locAmount: gl.getUniformLocation(base.program, 'u_amount')!,
    };
    shaders.set(state, loc);
  }
  return loc;
}
