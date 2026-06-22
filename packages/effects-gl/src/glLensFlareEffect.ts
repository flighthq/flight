import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, LensFlareEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Lens flare: a single-pass approximation. A true flare is a multi-pass recipe (downsample a bright
// pass, then accumulate ghosts and a halo from it). Here, on each fragment, we sample the source's
// bright spots along the vector from the pixel toward the center, adding `ghosts` evenly spaced ghost
// samples plus a halo ring, scaled by threshold/intensity. It previews the look without the bright-pass
// buffer.
export function applyLensFlareEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LensFlareEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const ghosts = effect.ghosts ?? 4;
  const halo = effect.halo ?? 0.5;
  const program = getGlEffectProgram(state, 'lens.lensFlare', LENS_FLARE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_ghosts'), ghosts);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_halo'), halo);
  });
}

export const defaultGlLensFlareEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensFlareEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LensFlareEffect);
};

const LENS_FLARE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_intensity;
uniform float u_ghosts;
uniform float u_halo;
out vec4 o_color;
vec3 brightPass(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  vec3 c = texture(u_texture0, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c * max(0.0, l - u_threshold);
}
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  // Single-pass approximation of a flare: walk ghost samples along the vector toward the optical
  // center and add a halo ring, all from the bright pass of the scene itself (no separate buffer).
  vec2 toCenter = (vec2(0.5) - v_texCoord);
  vec3 flare = vec3(0.0);
  int count = int(clamp(u_ghosts, 0.0, 8.0));
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    float t = (float(i) + 1.0) / (float(count) + 1.0);
    vec2 uv = v_texCoord + toCenter * (2.0 * t);
    flare += brightPass(uv);
  }
  vec2 haloDir = normalize(toCenter + vec2(1e-5));
  flare += brightPass(v_texCoord + haloDir * u_halo) * u_halo;
  o_color = vec4(scene.rgb + flare * u_intensity, scene.a);
}`;
