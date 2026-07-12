import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ColorLut, GlColorLutTextureCache, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Generic pointwise color-LUT pass — the single fold-in realization for the whole LUT-tier Adjustment
// family on WebGL 2. A run of consecutive pointwise adjustments containing any nonlinear (LUT-tier)
// member bakes to ONE 3D `ColorLut` (matrices folded in) and runs through this one trilinear pass instead
// of one pass per op. The LUT is uploaded as a `size³` RGBA8 3D texture; hardware LINEAR filtering does
// the trilinear interpolation. Sampled color is treated as premultiplied and passed straight into the
// LUT (matching the per-op color passes this replaces); alpha is preserved. `cache` owns the uploaded 3D
// texture across frames; the LUT is re-uploaded only when it differs by identity from the last one baked
// into `cache` (bakeColorLutForRun returns a stable reference for an unchanged run), so a static grade
// uploads once. The caller owns `cache.texture` and destroys it on teardown.
export function applyColorLutPassToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  lut: Readonly<ColorLut>,
  cache: GlColorLutTextureCache,
): void {
  const gl = state.gl;
  const size = lut.size;
  const texture = uploadLutTexture(gl, lut, cache);
  const program = getGlEffectProgram(state, 'adjustment.colorLut', COLOR_LUT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (glc, p) => {
    glc.uniform1f(glc.getUniformLocation(p.program, 'u_lutSize'), size);
    glc.activeTexture(glc.TEXTURE1);
    glc.bindTexture(glc.TEXTURE_3D, texture);
    glc.uniform1i(glc.getUniformLocation(p.program, 'u_lut'), 1);
    glc.activeTexture(glc.TEXTURE0);
  });
}

// Uploads `lut` into the cache's reusable 3D texture (RGBA8, LINEAR, clamp-to-edge) and returns it. The
// upload is skipped entirely when `lut` is the same reference already baked into the texture — the common
// static-grade case — so an unchanged grade costs one texImage3D total, not one per frame.
function uploadLutTexture(
  gl: WebGL2RenderingContext,
  lut: Readonly<ColorLut>,
  cache: GlColorLutTextureCache,
): WebGLTexture {
  if (cache.texture !== null && cache.lut === lut) return cache.texture;
  const n = lut.size;
  const samples = lut.samples;
  const data = new Uint8Array(n * n * n * 4);
  for (let i = 0, j = 0, o = 0; i < n * n * n; i++) {
    data[o++] = Math.round(clamp01(samples[j++]) * 255);
    data[o++] = Math.round(clamp01(samples[j++]) * 255);
    data[o++] = Math.round(clamp01(samples[j++]) * 255);
    data[o++] = 255;
  }
  let texture = cache.texture;
  if (texture === null) {
    texture = gl.createTexture()!;
    cache.texture = texture;
  }
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);
  cache.lut = lut;
  return texture;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Half-texel scale/offset maps the [0,1] color to LUT cell centres, so v=0 hits cell 0 and v=1 the last.
const COLOR_LUT_FRAGMENT_SRC = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler3D u_lut;
uniform float u_lutSize;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float scale = (u_lutSize - 1.0) / u_lutSize;
  float offset = 0.5 / u_lutSize;
  vec3 lc = clamp(c.rgb, 0.0, 1.0) * scale + offset;
  o_color = vec4(texture(u_lut, lc).rgb, c.a);
}`;
