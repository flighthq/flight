import { computeBoxBlurPassRadius } from '@flighthq/effects';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderTarget } from '@flighthq/types';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

const BOX_BLUR_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_radius;
uniform vec2 u_direction;
uniform vec4 u_edgeColor;
uniform float u_useEdgeColor;
out vec4 fragColor;
vec4 sampleBlur(vec2 uv) {
  if (u_useEdgeColor > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
    return u_edgeColor;
  }
  return texture(u_texture, uv);
}
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    fragColor = sampleBlur(v_texCoord);
    return;
  }
  vec4 sum = vec4(0.0);
  int count = 2 * r + 1;
  for (int i = -r; i <= r; i++) {
    sum += sampleBlur(v_texCoord + float(i) * u_texelSize * u_direction);
  }
  fragColor = sum / float(count);
}`;

type BoxBlurEdgeColor = readonly [number, number, number, number];

type BoxBlurShaderLocations = GlFullscreenProgram & {
  locTexelSize: WebGLUniformLocation;
  locRadius: WebGLUniformLocation;
  locDirection: WebGLUniformLocation;
  locEdgeColor: WebGLUniformLocation;
  locUseEdgeColor: WebGLUniformLocation;
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
  options: Readonly<{
    blurX?: number;
    blurY?: number;
    passes?: number;
    edgeColor?: readonly [number, number, number, number];
  }>,
): void {
  const passes = Math.max(1, Math.round(options.passes ?? 1));
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;
  const edgeColor = options.edgeColor;

  const loc = getBoxBlurShader(state);
  let read: GlRenderTarget = source;
  let write: GlRenderTarget = temp;

  // Each pass may use a different radius per axis so the box widths converge on the target sigma;
  // zero-radius passes are skipped. If nothing is written, the tail blit copies source to dest.
  for (let pass = 0; pass < passes; pass++) {
    const radiusX = computeBoxBlurPassRadius(blurX, passes, pass);
    if (radiusX > 0) {
      applyBoxBlurPass(state, read, write, loc, radiusX, 1, 0, edgeColor);
      read = write;
      write = write === temp ? dest : temp;
    }
    const radiusY = computeBoxBlurPassRadius(blurY, passes, pass);
    if (radiusY > 0) {
      applyBoxBlurPass(state, read, write, loc, radiusY, 0, 1, edgeColor);
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
    gl.uniform4f(loc.locEdgeColor, 0, 0, 0, 0);
    gl.uniform1f(loc.locUseEdgeColor, 0);
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
  edgeColor: BoxBlurEdgeColor | undefined,
): void {
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1f(loc.locRadius, radius);
    gl.uniform2f(loc.locDirection, dirX, dirY);
    if (edgeColor === undefined) {
      gl.uniform4f(loc.locEdgeColor, 0, 0, 0, 0);
      gl.uniform1f(loc.locUseEdgeColor, 0);
    } else {
      gl.uniform4f(loc.locEdgeColor, edgeColor[0], edgeColor[1], edgeColor[2], edgeColor[3]);
      gl.uniform1f(loc.locUseEdgeColor, 1);
    }
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
      locEdgeColor: gl.getUniformLocation(base.program, 'u_edgeColor')!,
      locUseEdgeColor: gl.getUniformLocation(base.program, 'u_useEdgeColor')!,
    };
    boxBlurShaders.set(state, loc);
  }
  return loc;
}
