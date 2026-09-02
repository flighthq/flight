import { drawGlFullscreenPass, resolveGlTexture } from '@flighthq/render-gl/contract';
import type {
  BitmapDisplacementEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  RenderEffect,
} from '@flighthq/types/contract';
import { ImageChannel, RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';
import { registerGlRenderEffect } from './glRenderEffectRegistry';

// Samples the displacement map and source in one fullscreen pass. Map channels are centred around
// 0.5, converted to pixel offsets by scaleX/scaleY, then normalized by the source resolution. Positive
// Y means down in image space, so the GL target's bottom-left texcoord subtracts that component.
export function applyBitmapDisplacementEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<BitmapDisplacementEffect>,
): void {
  const map = effect.map;
  const mapTexture = map === null ? null : resolveGlTexture(state, map, false, source.colorSpace);
  if (mapTexture === null) {
    const passthrough = getGlEffectProgram(
      state,
      'spatial.bitmapDisplacement.passthrough',
      BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_SRC,
    );
    drawGlFullscreenPass(state, passthrough, [source.texture], dest, NO_UNIFORMS);
    return;
  }
  const resolvedMap = map!;

  const program = getGlEffectProgram(state, 'spatial.bitmapDisplacement', BITMAP_DISPLACEMENT_FRAGMENT_SRC);
  const componentX = effect.componentX ?? ImageChannel.Red;
  const componentY = effect.componentY ?? ImageChannel.Green;
  const scaleX = effect.scaleX ?? 0;
  const scaleY = effect.scaleY ?? 0;
  const edgeMode = effect.edgeMode === 'clamp' ? 0 : 1;
  const mapIsRenderTarget = resolvedMap.source?.kind === RenderTargetTextureSourceKind;

  drawGlFullscreenPass(state, program, [source.texture, mapTexture], dest, (gl, p) => {
    const componentXLoc = getGlEffectUniformLocation(state, p, 'u_componentX');
    const componentYLoc = getGlEffectUniformLocation(state, p, 'u_componentY');
    const edgeModeLoc = getGlEffectUniformLocation(state, p, 'u_edgeMode');
    const mapIsRenderTargetLoc = getGlEffectUniformLocation(state, p, 'u_mapIsRenderTarget');
    const resolutionLoc = getGlEffectUniformLocation(state, p, 'u_resolution');
    const scaleLoc = getGlEffectUniformLocation(state, p, 'u_scale');
    if (componentXLoc !== null) gl.uniform1i(componentXLoc, componentX);
    if (componentYLoc !== null) gl.uniform1i(componentYLoc, componentY);
    if (edgeModeLoc !== null) gl.uniform1i(edgeModeLoc, edgeMode);
    if (mapIsRenderTargetLoc !== null) gl.uniform1i(mapIsRenderTargetLoc, mapIsRenderTarget ? 1 : 0);
    if (resolutionLoc !== null) gl.uniform2f(resolutionLoc, source.width, source.height);
    if (scaleLoc !== null) gl.uniform2f(scaleLoc, scaleX, scaleY);
  });
}

export const defaultGlBitmapDisplacementEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBitmapDisplacementEffectToGl(ctx.state, ctx.source, ctx.dest, effect as BitmapDisplacementEffect);
};

// Whether this instance resolves to the map-driven pass. The runner still copies through when false;
// pairing this query with registration lets the render-texture explanation distinguish that sentinel
// from a working displacement whose output happens to resemble its input.
export function isGlBitmapDisplacementEffectResolvable(state: GlRenderState, effect: Readonly<RenderEffect>): boolean {
  const map = (effect as Readonly<BitmapDisplacementEffect>).map;
  return map !== null && resolveGlTexture(state, map, false, map.colorSpace === 'linear' ? 'linear' : 'srgb') !== null;
}

export function registerGlBitmapDisplacementEffect(state: GlRenderState): void {
  registerGlRenderEffect(
    state,
    'BitmapDisplacementEffect',
    defaultGlBitmapDisplacementEffectRunner,
    isGlBitmapDisplacementEffectResolvable,
  );
}

export const BITMAP_DISPLACEMENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform int u_componentX;
uniform int u_componentY;
uniform int u_edgeMode;
uniform int u_mapIsRenderTarget;
uniform vec2 u_resolution;
uniform vec2 u_scale;
out vec4 o_color;

float sampleChannel(vec4 value, int component) {
  if (component == 0) return value.r;
  if (component == 1) return value.g;
  if (component == 2) return value.b;
  return value.a;
}

void main() {
  // Fullscreen GL texcoords and render-target textures are bottom-origin. Uploaded Bitmap/Image map
  // rows are top-origin, so reflect only that source family; a RenderTarget map already matches.
  vec2 mapUv = vec2(v_texCoord.x, u_mapIsRenderTarget == 1 ? v_texCoord.y : 1.0 - v_texCoord.y);
  vec4 mapSample = texture(u_texture1, mapUv);
  vec2 mapped = vec2(
    sampleChannel(mapSample, u_componentX),
    sampleChannel(mapSample, u_componentY)
  );
  vec2 displacementPixels = (mapped - vec2(0.5)) * u_scale;
  vec2 displacement = displacementPixels / u_resolution;
  vec2 displaced = vec2(v_texCoord.x + displacement.x, v_texCoord.y - displacement.y);
  vec2 sourceUv = u_edgeMode == 1
    ? fract(displaced)
    : clamp(displaced, vec2(0.0), vec2(1.0));
  o_color = texture(u_texture0, sourceUv);
}`;

const BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;

const NO_UNIFORMS = () => {};
