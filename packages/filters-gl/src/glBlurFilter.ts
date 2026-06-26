import { computeBoxBlurPassRadius } from '@flighthq/filters-math';
import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { BlurFilter, GlFullscreenProgram, GlRenderState } from '@flighthq/types';

const BOX_BLUR_FRAGMENT_SRC = `#version 300 es
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

const GAUSSIAN_BLUR_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_sigma;
uniform float u_radius;
uniform vec2 u_direction;
out vec4 fragColor;
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  float twoSigmaSq = 2.0 * u_sigma * u_sigma;
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / twoSigmaSq);
    sum += w * texture(u_texture, v_texCoord + float(i) * u_texelSize * u_direction);
    weightSum += w;
  }
  fragColor = sum / weightSum;
}`;

type BoxBlurShaderLocations = GlFullscreenProgram & {
  locTexelSize: WebGLUniformLocation;
  locRadius: WebGLUniformLocation;
  locDirection: WebGLUniformLocation;
};

type GaussianBlurShaderLocations = BoxBlurShaderLocations & {
  locSigma: WebGLUniformLocation;
};

const boxBlurShaders = new WeakMap<GlRenderState, BoxBlurShaderLocations>();
const gaussianBlurShaders = new WeakMap<GlRenderState, GaussianBlurShaderLocations>();

/**
 * Applies a blur filter descriptor to `source`, writing to `dest`. Dispatches
 * to `applyBoxBlurFilterToGl` with the descriptor's `blurX`/`blurY` values,
 * giving the same `Readonly<Omit<BlurFilter,'kind'>>` signature as the other
 * `apply*FilterToGl` functions in this package.
 *
 * `temp` is a caller-provided ping-pong scratch target distinct from both
 * `source` and `dest`.
 */
export function applyBlurFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  temp: GlRenderTarget,
  filter: Readonly<Omit<BlurFilter, 'kind'>>,
): void {
  applyBoxBlurFilterToGl(state, source, dest, temp, {
    blurX: filter.blurX,
    blurY: filter.blurY,
  });
}

/**
 * Applies a separable box blur to `source`, writing to `dest`. `blurX`/`blurY` are the target
 * Gaussian standard deviations; `passes` is the number of box passes per axis (more passes
 * converge on a Gaussian — see `computeBoxBlurPassRadius` — not a larger blur). A box blur is cheap
 * and the right building block for soft spreads (glow, drop shadow); for a faithful Gaussian use
 * `applyGaussianBlurFilterToGl`. `temp` is a caller-provided ping-pong scratch target distinct
 * from both `source` and `dest`.
 */
export function applyBoxBlurFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  temp: GlRenderTarget,
  options: Readonly<{ blurX?: number; blurY?: number; passes?: number }>,
): void {
  const passes = Math.max(1, Math.round(options.passes ?? 1));
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;

  const loc = getBoxBlurShader(state);
  let read: GlRenderTarget = source;
  let write: GlRenderTarget = temp;

  // Each pass may use a different radius per axis so the box widths converge on the target sigma;
  // zero-radius passes are skipped. If nothing is written, the tail blit copies source to dest.
  for (let pass = 0; pass < passes; pass++) {
    const radiusX = computeBoxBlurPassRadius(blurX, passes, pass);
    if (radiusX > 0) {
      applyBoxBlurPass(state, read, write, loc, radiusX, 1, 0);
      read = write;
      write = write === temp ? dest : temp;
    }
    const radiusY = computeBoxBlurPassRadius(blurY, passes, pass);
    if (radiusY > 0) {
      applyBoxBlurPass(state, read, write, loc, radiusY, 0, 1);
      read = write;
      write = write === temp ? dest : temp;
    }
  }

  if (read !== dest) {
    applyBlurBlit(state, read, dest);
  }
}

/**
 * Applies a faithful separable Gaussian blur to `source`, writing to `dest`. `blurX`/`blurY` are
 * the Gaussian standard deviations (CSS `blur(Xpx)` uses sigma = X), so this matches the CSS and
 * surface Gaussian paths. Each axis is a single weighted pass with radius ⌈3σ⌉ — a Gaussian needs
 * no repetition. `temp` is a ping-pong scratch target distinct from both `source` and `dest`.
 */
export function applyGaussianBlurFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  temp: GlRenderTarget,
  options: Readonly<{ blurX?: number; blurY?: number }>,
): void {
  const sigmaX = options.blurX ?? 4;
  const sigmaY = options.blurY ?? 4;
  const radiusX = sigmaX > 0 ? Math.ceil(sigmaX * 3) : 0;
  const radiusY = sigmaY > 0 ? Math.ceil(sigmaY * 3) : 0;

  if (radiusX === 0 && radiusY === 0) {
    applyBlurBlit(state, source, dest);
    return;
  }

  const loc = getGaussianBlurShader(state);
  let read: GlRenderTarget = source;
  let write: GlRenderTarget = temp;

  if (radiusX > 0) {
    applyGaussianBlurPass(state, read, write, loc, sigmaX, radiusX, 1, 0);
    read = write;
    write = write === temp ? dest : temp;
  }
  if (radiusY > 0) {
    applyGaussianBlurPass(state, read, write, loc, sigmaY, radiusY, 0, 1);
    read = write;
    write = write === temp ? dest : temp;
  }

  if (read !== dest) {
    applyBlurBlit(state, read, dest);
  }
}

function applyBlurBlit(state: GlRenderState, source: GlRenderTarget, dest: GlRenderTarget): void {
  const loc = getBoxBlurShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 0, 0);
    gl.uniform1f(loc.locRadius, 0);
    gl.uniform2f(loc.locDirection, 0, 0);
  });
}

function applyBoxBlurPass(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  loc: BoxBlurShaderLocations,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1f(loc.locRadius, radius);
    gl.uniform2f(loc.locDirection, dirX, dirY);
  });
}

function applyGaussianBlurPass(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  loc: GaussianBlurShaderLocations,
  sigma: number,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1f(loc.locSigma, sigma);
    gl.uniform1f(loc.locRadius, radius);
    gl.uniform2f(loc.locDirection, dirX, dirY);
  });
}

function getBoxBlurShader(state: GlRenderState): BoxBlurShaderLocations {
  let loc = boxBlurShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, BOX_BLUR_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locRadius: gl.getUniformLocation(base.program, 'u_radius')!,
      locDirection: gl.getUniformLocation(base.program, 'u_direction')!,
    };
    boxBlurShaders.set(state, loc);
  }
  return loc;
}

function getGaussianBlurShader(state: GlRenderState): GaussianBlurShaderLocations {
  let loc = gaussianBlurShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, GAUSSIAN_BLUR_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locSigma: gl.getUniformLocation(base.program, 'u_sigma')!,
      locRadius: gl.getUniformLocation(base.program, 'u_radius')!,
      locDirection: gl.getUniformLocation(base.program, 'u_direction')!,
    };
    gaussianBlurShaders.set(state, loc);
  }
  return loc;
}
