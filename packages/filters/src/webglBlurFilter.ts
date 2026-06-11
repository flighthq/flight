import type { WebGLRenderStateInternal, WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';
import type { BlurFilter } from '@flighthq/types';

import type { WebGLFilterLocations } from './webglFilterPass';
import { compileWebGLFilterProgram, drawWebGLFilterPass } from './webglFilterPass';

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

const _blurShaders = new WeakMap<WebGLRenderState, BlurShaderLocations>();

function getBlurShader(state: WebGLRenderState): BlurShaderLocations {
  let loc = _blurShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, BLUR_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locRadius: gl.getUniformLocation(base.program, 'u_radius')!,
      locDirection: gl.getUniformLocation(base.program, 'u_direction')!,
    };
    _blurShaders.set(state, loc);
  }
  return loc;
}

/**
 * Applies a Gaussian-approximating blur to `source` and writes the result to
 * `dest`. `blurX`/`blurY` are the Gaussian standard deviation in pixels; the
 * separable box passes are variance-matched to that sigma so the result agrees
 * with the CSS `blur()` and surface paths. `quality` is the number of box passes
 * per axis (higher = closer to a true Gaussian).
 *
 * `temp` is a caller-provided scratch target of the same dimensions as `dest`,
 * used to ping-pong the separable passes — the filter allocates nothing itself.
 * `source` is read-only (never written), so it may safely be reused afterwards.
 * `source`, `dest`, and `temp` must be three distinct targets.
 */
export function applyWebGLBlurFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  temp: WebGLRenderTarget,
  options: Omit<BlurFilter, 'type'> = {},
): void {
  const passes = Math.max(1, Math.round(options.quality ?? 1));
  const radiusX = boxRadiusForSigma(options.blurX ?? 4, passes);
  const radiusY = boxRadiusForSigma(options.blurY ?? 4, passes);

  if (radiusX === 0 && radiusY === 0) {
    applyBlurBlit(state, source, dest);
    return;
  }

  const loc = getBlurShader(state);

  // Ping-pong between temp and dest, keeping source read-only: the first pass
  // reads source; every later pass reads the previous pass's output.
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
 * Computes the box-blur radius whose `passes`-fold repetition has the same
 * variance as a Gaussian of standard deviation `sigma` (a box of radius r has
 * variance (r²+r)/3, and variances add across passes). This makes `blurX`/`blurY`
 * mean "Gaussian standard deviation in pixels" — matching the CSS `blur()` and
 * surface paths — while `quality` (the pass count) controls how closely the
 * repeated box converges to a true Gaussian, not the blur amount.
 */
export function boxRadiusForSigma(sigma: number, passes: number): number {
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

// Pass-through blit reuses the blur shader with radius=0.
function applyBlurBlit(state: WebGLRenderState, source: WebGLRenderTarget, dest: WebGLRenderTarget): void {
  const loc = getBlurShader(state);
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform2f(loc.locTexelSize, 0, 0);
    gl.uniform1f(loc.locRadius, 0);
    gl.uniform2f(loc.locDirection, 0, 0);
  });
}
