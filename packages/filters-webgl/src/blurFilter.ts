import type { WebGLRenderStateInternal, WebGLRenderTarget } from '@flighthq/render-webgl';
import type { BlurFilter } from '@flighthq/types';
import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLFilterLocations } from './filterPass';
import { compileWebGLFilterProgram, drawWebGLFilterPass } from './filterPass';

const BLUR_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_radius;
uniform vec2 u_direction;
out vec4 fragColor;
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  vec4 sum = vec4(0.0);
  int count = 2 * r + 1;
  for (int i = -r; i <= r; i++) {
    sum += texture(u_texture, v_texCoord + float(i) * u_texelSize * u_direction);
  }
  fragColor = sum / float(count);
}`;

type BlurShaderLocations = WebGLFilterLocations & {
  locTexelSize: WebGLUniformLocation;
  locRadius: WebGLUniformLocation;
  locDirection: WebGLUniformLocation;
};

const blurShaders = new WeakMap<WebGLRenderState, BlurShaderLocations>();

/**
 * Applies a Gaussian-approximating separable box blur to `source`, writing to `dest`.
 * `blurX`/`blurY` are Gaussian standard deviations; `quality` controls the number of
 * box passes per axis (higher = closer to a true Gaussian, not a larger blur radius).
 * `temp` is a caller-provided scratch target for ping-pong; it must be distinct from
 * both `source` and `dest`.
 */
export function applyBlurFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  temp: WebGLRenderTarget,
  filter: Readonly<Omit<BlurFilter, 'type'>>,
): void {
  const passes = Math.max(1, Math.round(filter.quality ?? 1));
  const radiusX = computeBoxBlurRadiusWebGL(filter.blurX ?? 4, passes);
  const radiusY = computeBoxBlurRadiusWebGL(filter.blurY ?? 4, passes);

  if (radiusX === 0 && radiusY === 0) {
    applyBlurBlit(state, source, dest);
    return;
  }

  const loc = getBlurShader(state);
  let read: WebGLRenderTarget = source;
  let write: WebGLRenderTarget = temp;

  for (let pass = 0; pass < passes; pass++) {
    if (radiusX > 0) {
      applyBlurPass(state, read, write, loc, radiusX, 1, 0);
      read = write;
      write = write === temp ? dest : temp;
    }
    if (radiusY > 0) {
      applyBlurPass(state, read, write, loc, radiusY, 0, 1);
      read = write;
      write = write === temp ? dest : temp;
    }
  }

  if (read !== dest) {
    applyBlurBlit(state, read, dest);
  }
}

/**
 * Converts a Gaussian standard deviation to a box-blur radius whose `passes`-fold
 * repetition has the same variance. Matches the CSS `blur()` and surface paths so
 * all three substrates agree on what `blurX`/`blurY` mean.
 */
export function computeBoxBlurRadiusWebGL(sigma: number, passes: number): number {
  if (sigma <= 0) return 0;
  return Math.max(0, Math.round((-1 + Math.sqrt(1 + (12 * sigma * sigma) / passes)) / 2));
}

function applyBlurPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  loc: BlurShaderLocations,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1f(loc.locRadius, radius);
    gl.uniform2f(loc.locDirection, dirX, dirY);
  });
}

function applyBlurBlit(state: WebGLRenderState, source: WebGLRenderTarget, dest: WebGLRenderTarget): void {
  const loc = getBlurShader(state);
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform2f(loc.locTexelSize, 0, 0);
    gl.uniform1f(loc.locRadius, 0);
    gl.uniform2f(loc.locDirection, 0, 0);
  });
}

function getBlurShader(state: WebGLRenderState): BlurShaderLocations {
  let loc = blurShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, BLUR_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locRadius: gl.getUniformLocation(base.program, 'u_radius')!,
      locDirection: gl.getUniformLocation(base.program, 'u_direction')!,
    };
    blurShaders.set(state, loc);
  }
  return loc;
}
