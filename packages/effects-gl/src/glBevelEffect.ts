import {
  acquireGlRenderTarget,
  clearGlRenderTarget,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  releaseGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  BevelEffect,
  GlFullscreenProgram,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGlEffectBlitPass, applyGlEffectErasePass } from './glEffectBlitShader';
import { applyGlEffectBoxBlur } from './glEffectBoxBlur';
import { applyGlEffectTintPass } from './glEffectTintShader';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType and composited over the source.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// inlined multi-pass recipe, then releases them.
//
// The bevel is the directional gradient of the source's blurred alpha:
// `gradient = m(p − L) − m(p + L)` where `m` is the blurred alpha and
// `L = (cos angle, sin angle) · distance`. A positive gradient (the edge facing
// the light) draws the highlight color; a negative gradient draws the shadow
// color; `|gradient| · strength` is the band's alpha. The resulting tinted mask
// is composited over the source — matching `bevelSurface` (the CPU reference).
//
// `bevelType` clips the mask:
//   - `'inner'` (default): keep the band inside the shape (× source alpha)
//   - `'outer'`: keep it outside the shape (× 1 − source alpha)
//   - `'full'`: no clip
export function applyBevelEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<BevelEffect>,
): void {
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireGlRenderTarget(state, pool, descriptor);
  const s1 = acquireGlRenderTarget(state, pool, descriptor);
  const s2 = acquireGlRenderTarget(state, pool, descriptor);

  const src = source as GlRenderTarget;
  const dst = dest as GlRenderTarget;

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  // Match the surface reference, which snaps the light offset to whole pixels.
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const shadowColor = effect.shadowColor ?? 0x000000;
  const shadowAlpha = effect.shadowAlpha ?? 1;
  const highlightColor = effect.highlightColor ?? 0xffffff;
  const highlightAlpha = effect.highlightAlpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';
  const bevelType = effect.bevelType ?? 'inner';

  const [tinted, blurred, blurTemp] = [s0, s1, s2];

  // Blurred alpha field (neutral white tint, strength 1 — strength is the gradient
  // intensity applied per-pixel in the composite, not baked into the field).
  applyGlEffectTintPass(state, src, tinted, 0xffffff, 1, 1);
  applyGlEffectBoxBlur(state, tinted, blurred, blurTemp, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    passes: quality,
  });

  clearGlRenderTarget(state, dst);
  if (sourceMode === 'draw') applyGlEffectBlitPass(state, src, dst);

  applyGlBevelCompositePass(state, blurred, src, dst, {
    offsetX: offsetX / src.width,
    // Negate Y to match the screen-space-Y-down offset convention used by applyGlEffectBlitOffsetPass.
    offsetY: -offsetY / src.height,
    highlightColor,
    highlightAlpha,
    shadowColor,
    shadowAlpha,
    intensity: strength,
    clipMode: bevelType === 'inner' ? 1 : bevelType === 'outer' ? 2 : 0,
  });

  if (sourceMode === 'knockout') applyGlEffectErasePass(state, src, dst);

  releaseGlRenderTarget(pool, s0);
  releaseGlRenderTarget(pool, s1);
  releaseGlRenderTarget(pool, s2);
}

export const defaultGlBevelEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBevelEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as BevelEffect);
};

// Reads the blurred alpha field (unit 0) and source (unit 1); writes the tinted, clipped bevel mask,
// premultiplied, blended over `dest` (which already holds the source when sourceMode is 'draw').
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
