import { computeBoxBlurPassRadius } from '@flighthq/effects';
import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

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

type BoxBlurShaderLocations = GlFullscreenProgram & {
  locTexelSize: WebGLUniformLocation;
  locRadius: WebGLUniformLocation;
  locDirection: WebGLUniformLocation;
};

const boxBlurShaders = new WeakMap<GlRenderState, BoxBlurShaderLocations>();

/**
 * Applies a separable box blur to `source`, writing to `dest`. `blurX`/`blurY` are the target
 * Gaussian standard deviations; `passes` is the number of box passes per axis (more passes
 * converge on a Gaussian — see `computeBoxBlurPassRadius` — not a larger blur). A box blur is cheap
 * and the right building block for soft spreads (glow, drop shadow). `temp` is a caller-provided
 * ping-pong scratch target distinct from both `source` and `dest`.
 */
export function applyGlEffectBoxBlur(
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

function applyBlurBlit(state: GlRenderState, source: GlRenderTarget, dest: GlRenderTarget): void {
  const loc = getBoxBlurShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 0, 0);
    gl.uniform1f(loc.locRadius, 0);
    gl.uniform2f(loc.locDirection, 0, 0);
    gl.blendFunc(gl.ONE, gl.ZERO);
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
    gl.blendFunc(gl.ONE, gl.ZERO);
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
