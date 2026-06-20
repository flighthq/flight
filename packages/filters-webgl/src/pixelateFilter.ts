import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import { compileWebGLFullscreenProgram, drawWebGLFullscreenPass } from '@flighthq/render-webgl';
import type { PixelateFilter } from '@flighthq/types';
import type { WebGLFullscreenProgram, WebGLRenderState } from '@flighthq/types';

const PIXELATE_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_blockTexelSize;
out vec4 fragColor;
void main() {
  vec2 block = floor(v_texCoord / u_blockTexelSize) * u_blockTexelSize;
  vec2 center = block + u_blockTexelSize * 0.5;
  fragColor = texture(u_texture, clamp(center, vec2(0.0), vec2(1.0)));
}`;

type PixelateShaderLocations = WebGLFullscreenProgram & {
  locBlockTexelSize: WebGLUniformLocation;
};

const shaders = new WeakMap<WebGLRenderState, PixelateShaderLocations>();

/**
 * Pixelates `source` into `dest` by averaging each block of `blockSize` pixels
 * into a single flat color. A single GPU pass — no scratch targets needed.
 */
export function applyPixelateFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  filter: Readonly<Omit<PixelateFilter, 'type'>>,
): void {
  const blockSize = Math.max(1, filter.blockSize ?? 8);
  const loc = getShader(state);
  drawWebGLFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locBlockTexelSize, blockSize / source.width, blockSize / source.height);
  });
}

function getShader(state: WebGLRenderState): PixelateShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileWebGLFullscreenProgram(gl, PIXELATE_FRAGMENT_SRC);
    loc = { ...base, locBlockTexelSize: gl.getUniformLocation(base.program, 'u_blockTexelSize')! };
    shaders.set(state, loc);
  }
  return loc;
}
