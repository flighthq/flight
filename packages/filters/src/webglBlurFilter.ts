import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderStateInternal } from '@flighthq/render-webgl';
import { createWebGLRenderTarget, destroyWebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { BlurFilter } from './index';
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
 * Applies a box blur filter to `source` and writes the result to `dest`.
 * Uses a separable two-pass (horizontal then vertical) approach. For quality > 1
 * the pass pair is repeated, converging toward a Gaussian. Source and dest must
 * be different render targets of the same dimensions.
 */
export function applyWebGLBlurFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  options: Omit<BlurFilter, 'type'> = {},
): void {
  const passes = Math.max(1, Math.round(options.quality ?? 1));
  const radiusX = Math.max(0, Math.round((options.blurX ?? 4) / 2));
  const radiusY = Math.max(0, Math.round((options.blurY ?? 4) / 2));

  if (radiusX === 0 && radiusY === 0) {
    applyBlurBlit(state, source, dest);
    return;
  }

  const loc = getBlurShader(state);
  // One temp target is enough for any quality level: ping-pong between temp and dest.
  const temp = createWebGLRenderTarget(state, dest.width, dest.height);

  // First half-pass: source → temp (H or V depending on which is non-zero)
  // For quality=1: source→temp (H), temp→dest (V)
  // For quality=2: source→temp (H), temp→dest (V), dest→temp (H), temp→dest (V)
  let current: WebGLRenderTarget = source;
  let next: WebGLRenderTarget = temp;

  for (let pass = 0; pass < passes; pass++) {
    if (radiusX > 0) {
      applyBlurPass(state, current, next, loc, radiusX, 1, 0);
      [current, next] = [next, current];
    }
    if (radiusY > 0) {
      applyBlurPass(state, current, next, loc, radiusY, 0, 1);
      [current, next] = [next, current];
    }
  }

  // If the last written target is temp (current === temp), blit to dest.
  // If current === dest, it's already there.
  if (current !== dest) {
    applyBlurBlit(state, current, dest);
  }

  destroyWebGLRenderTarget(state, temp);
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
