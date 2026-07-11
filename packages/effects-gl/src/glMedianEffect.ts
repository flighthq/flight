import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, MedianEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Largest median-filter radius the WebGL path supports (radius 2 → a 5×5, 25-sample window). The cap
// is the fixed sort-array size in the fragment shader; larger radii are unsupported on this backend.
export const MAX_MEDIAN_EFFECT_GL_RADIUS = 2;

const MAX_SAMPLES = (MAX_MEDIAN_EFFECT_GL_RADIUS * 2 + 1) * (MAX_MEDIAN_EFFECT_GL_RADIUS * 2 + 1); // 25

// Per-channel median denoise: each output pixel is the median of its (2·radius+1)² neighborhood.
// Preserves edges while removing salt-and-pepper noise. A single GPU pass — no scratch targets.
export function applyMedianEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<MedianEffect>,
): void {
  const radius = Math.min(MAX_MEDIAN_EFFECT_GL_RADIUS, Math.max(0, Math.round(effect.radius ?? 1)));
  const program = getGlEffectProgram(state, 'stylization.median', MEDIAN_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_texelSize'), 1 / source.width, 1 / source.height);
    gl.uniform1i(gl.getUniformLocation(p.program, 'u_radius'), radius);
  });
}

export const defaultGlMedianEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyMedianEffectToGl(ctx.state, ctx.source, ctx.dest, effect as MedianEffect);
};

const MEDIAN_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_texelSize;
uniform int u_radius;
out vec4 fragColor;

const int MAX_S = ${MAX_SAMPLES};

void sortFloat(inout float arr[MAX_S], int n) {
  for (int i = 1; i < n; i++) {
    float key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

void main() {
  int r = clamp(u_radius, 0, ${MAX_MEDIAN_EFFECT_GL_RADIUS});
  if (r == 0) {
    fragColor = texture(u_texture0, v_texCoord);
    return;
  }
  int n = (2 * r + 1) * (2 * r + 1);
  float rv[MAX_S];
  float gv[MAX_S];
  float bv[MAX_S];
  float av[MAX_S];
  int count = 0;
  for (int dy = -${MAX_MEDIAN_EFFECT_GL_RADIUS}; dy <= ${MAX_MEDIAN_EFFECT_GL_RADIUS}; dy++) {
    for (int dx = -${MAX_MEDIAN_EFFECT_GL_RADIUS}; dx <= ${MAX_MEDIAN_EFFECT_GL_RADIUS}; dx++) {
      if (abs(dy) <= r && abs(dx) <= r) {
        vec4 s = texture(u_texture0, v_texCoord + vec2(float(dx), float(dy)) * u_texelSize);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count++;
      }
    }
  }
  sortFloat(rv, n);
  sortFloat(gv, n);
  sortFloat(bv, n);
  sortFloat(av, n);
  int mid = n / 2;
  fragColor = vec4(rv[mid], gv[mid], bv[mid], av[mid]);
}`;
