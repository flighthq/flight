import type { GlRenderTarget } from '@flighthq/render-gl';
import { clearGlRenderTarget, compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { BevelFilter, GlFullscreenProgram, GlRenderState } from '@flighthq/types';

import { applyGlBlitPass } from './glBlitShader';
import { applyBoxBlurFilterToGl } from './glBlurFilter';
import { applyGlTintPass } from './glTintShader';

/**
 * Applies a bevel filter to `source`, writing the result to `dest`.
 *
 * The bevel is the directional gradient of the source's blurred alpha:
 * `gradient = m(p − L) − m(p + L)` where `m` is the blurred alpha and
 * `L = (cos angle, sin angle) · distance`. A positive gradient (the edge facing
 * the light) draws the highlight color; a negative gradient draws the shadow
 * color; `|gradient| · strength` is the band's alpha. The resulting tinted mask
 * is composited over the source — matching `bevelSurface` (the CPU reference).
 *
 * `bevelType` clips the mask:
 *   - `'inner'` (default): keep the band inside the shape (× source alpha)
 *   - `'outer'`: keep it outside the shape (× 1 − source alpha)
 *   - `'full'`: no clip
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`
 * (white-tinted alpha, blurred field, and the blur's ping-pong temp). The filter
 * allocates nothing itself.
 */
export function applyBevelFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  scratch: GlRenderTarget[],
  filter: Readonly<Omit<BevelFilter, 'kind'>>,
): void {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  // Match the surface reference, which snaps the light offset to whole pixels.
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const shadowColor = filter.shadowColor ?? 0x000000;
  const shadowAlpha = filter.shadowAlpha ?? 1;
  const highlightColor = filter.highlightColor ?? 0xffffff;
  const highlightAlpha = filter.highlightAlpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const knockout = filter.knockout ?? false;
  const bevelType = filter.bevelType ?? 'inner';

  const [tinted, blurred, blurTemp] = scratch;

  // Blurred alpha field (neutral white tint, strength 1 — strength is the gradient
  // intensity applied per-pixel in the composite, not baked into the field).
  applyGlTintPass(state, source, tinted, 0xffffff, 1, 1);
  applyBoxBlurFilterToGl(state, tinted, blurred, blurTemp, {
    blurX: filter.blurX ?? 4,
    blurY: filter.blurY ?? 4,
    passes: quality,
  });

  clearGlRenderTarget(state, dest);
  if (!knockout) applyGlBlitPass(state, source, dest);

  applyGlBevelCompositePass(state, blurred, source, dest, {
    offsetX: offsetX / source.width,
    // Negate Y to match the screen-space-Y-down offset convention used by applyGlBlitOffsetPass.
    offsetY: -offsetY / source.height,
    highlightColor,
    highlightAlpha,
    shadowColor,
    shadowAlpha,
    intensity: strength,
    clipMode: bevelType === 'inner' ? 1 : bevelType === 'outer' ? 2 : 0,
  });
}

// Reads the blurred alpha field (unit 0) and source (unit 1); writes the tinted, clipped bevel mask,
// premultiplied, blended over `dest` (which already holds the source unless knockout).
const BEVEL_COMPOSITE_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec4 u_highlight;
uniform vec4 u_shadow;
uniform vec2 u_offset;
uniform float u_intensity;
uniform float u_clipMode;
out vec4 fragColor;

float sampleField(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(u_texture0, uv).a;
}

void main() {
  float lit = sampleField(v_texCoord - u_offset);
  float shade = sampleField(v_texCoord + u_offset);
  float gradient = lit - shade;
  float srcA = texture(u_texture1, v_texCoord).a;
  bool isHighlight = gradient >= 0.0;
  vec3 color = isHighlight ? u_highlight.rgb : u_shadow.rgb;
  float colorAlpha = isHighlight ? u_highlight.a : u_shadow.a;
  float clip = 1.0;
  if (u_clipMode == 1.0) { clip = srcA; }
  else if (u_clipMode == 2.0) { clip = 1.0 - srcA; }
  float edge = min(1.0, abs(gradient) * u_intensity);
  float a = edge * colorAlpha * clip;
  fragColor = vec4(color * a, a);
}`;

type BevelCompositeLocations = GlFullscreenProgram & {
  locHighlight: WebGLUniformLocation;
  locShadow: WebGLUniformLocation;
  locOffset: WebGLUniformLocation;
  locIntensity: WebGLUniformLocation;
  locClipMode: WebGLUniformLocation;
};

const bevelCompositeShaders = new WeakMap<GlRenderState, BevelCompositeLocations>();

type BevelCompositeParams = Readonly<{
  offsetX: number;
  offsetY: number;
  highlightColor: number;
  highlightAlpha: number;
  shadowColor: number;
  shadowAlpha: number;
  intensity: number;
  clipMode: number;
}>;

function applyGlBevelCompositePass(
  state: GlRenderState,
  field: GlRenderTarget,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  params: BevelCompositeParams,
): void {
  const loc = getGlBevelCompositeShader(state);
  drawGlFullscreenPass(state, loc, [field.texture, source.texture], dest, (gl) => {
    gl.uniform4f(
      loc.locHighlight,
      ((params.highlightColor >> 16) & 0xff) / 255,
      ((params.highlightColor >> 8) & 0xff) / 255,
      (params.highlightColor & 0xff) / 255,
      params.highlightAlpha,
    );
    gl.uniform4f(
      loc.locShadow,
      ((params.shadowColor >> 16) & 0xff) / 255,
      ((params.shadowColor >> 8) & 0xff) / 255,
      (params.shadowColor & 0xff) / 255,
      params.shadowAlpha,
    );
    gl.uniform2f(loc.locOffset, params.offsetX, params.offsetY);
    gl.uniform1f(loc.locIntensity, params.intensity);
    gl.uniform1f(loc.locClipMode, params.clipMode);
  });
}

function getGlBevelCompositeShader(state: GlRenderState): BevelCompositeLocations {
  let loc = bevelCompositeShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, BEVEL_COMPOSITE_FRAGMENT_SRC);
    loc = {
      ...base,
      locHighlight: gl.getUniformLocation(base.program, 'u_highlight')!,
      locShadow: gl.getUniformLocation(base.program, 'u_shadow')!,
      locOffset: gl.getUniformLocation(base.program, 'u_offset')!,
      locIntensity: gl.getUniformLocation(base.program, 'u_intensity')!,
      locClipMode: gl.getUniformLocation(base.program, 'u_clipMode')!,
    };
    bevelCompositeShaders.set(state, loc);
  }
  return loc;
}
