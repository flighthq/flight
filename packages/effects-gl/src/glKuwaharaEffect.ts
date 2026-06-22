import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, KuwaharaEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Kuwahara: edge-preserving smoothing. Over a fixed small radius split the neighborhood into four
// overlapping quadrants, compute each mean and variance, and emit the lowest-variance mean — flattens
// regions while keeping edges crisp. `radius` gates the sampled extent.
export function applyKuwaharaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<KuwaharaEffect>,
): void {
  const radius = effect.radius ?? 3;
  const program = getGlEffectProgram(state, 'stylization.kuwahara', KUWAHARA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radius'), Math.max(1, radius));
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlKuwaharaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyKuwaharaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as KuwaharaEffect);
};

const KUWAHARA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_radius;
uniform vec2 u_resolution;
out vec4 o_color;
const int R = 4;
void main() {
  vec2 texel = 1.0 / u_resolution;
  int r = int(min(float(R), u_radius));
  vec3 means[4];
  float vars[4];
  ivec2 lo[4] = ivec2[4](ivec2(-1, -1), ivec2(0, -1), ivec2(-1, 0), ivec2(0, 0));
  for (int q = 0; q < 4; q++) {
    vec3 sum = vec3(0.0);
    vec3 sumSq = vec3(0.0);
    float n = 0.0;
    for (int y = 0; y <= R; y++) {
      for (int x = 0; x <= R; x++) {
        if (x > r || y > r) continue;
        ivec2 d = ivec2(x, y) * sign(lo[q] + ivec2(1)) + lo[q] * r;
        vec2 off = vec2(float(d.x), float(d.y)) * texel;
        vec3 col = texture(u_texture0, v_texCoord + off).rgb;
        sum += col;
        sumSq += col * col;
        n += 1.0;
      }
    }
    vec3 mean = sum / n;
    means[q] = mean;
    vec3 v = sumSq / n - mean * mean;
    vars[q] = v.r + v.g + v.b;
  }
  float minVar = vars[0];
  vec3 result = means[0];
  for (int q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
    }
  }
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}`;
