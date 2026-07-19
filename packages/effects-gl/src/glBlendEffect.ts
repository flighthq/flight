import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  AdvancedBlendMode,
  BlendEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
} from '@flighthq/types';
import { AdvancedBlendMode as AdvancedBlendModeValues } from '@flighthq/types';

import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';

// Advanced-blend composite pass: sample the incoming layer (`u_texture0`, the effect's `source`) and a
// registered backdrop (`u_texture1`), compute the destination-reading / non-separable blend named by the
// effect's `mode`, composite the blended color over the backdrop (Porter-Duff source-over), and write to
// `dest`. This is the GL realization of the `BlendEffect` composite recipe — the escape hatch for the
// AdvancedBlendMode set the fixed-function BlendMode enum cannot express. The GLSL mirrors
// @flighthq/effects blendModeMath exactly, so the pass is verified against those plain-number tests.
//
// The backdrop is looked up by the effect's `backdropKey` in the per-state backdrop registry populated by
// registerGlBlendEffectBackdrop. An unregistered (or absent) key composites the layer over an implicit
// transparent backdrop, which reduces to source-over passthrough rather than erroring.
export function applyBlendEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<BlendEffect>,
): void {
  const backdrop = getGlBlendEffectBackdrop(state, effect.backdropKey ?? null);
  const program = getGlEffectProgram(state, 'blend.advanced', BLEND_FRAGMENT_SRC);
  const modeIndex = getBlendEffectModeIndex(effect.mode);
  const opacity = effect.opacity ?? 1;
  const hasBackdrop = backdrop !== null;

  // Bind the layer to unit 0 and the backdrop (or the layer itself as a harmless stand-in) to unit 1;
  // `u_hasBackdrop` gates whether unit 1 is used, so a missing backdrop is a source-over passthrough.
  const inputs = [source.texture, hasBackdrop ? (backdrop as WebGLTexture) : source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    const modeLoc = getGlEffectUniformLocation(state, p, 'u_mode');
    const opacityLoc = getGlEffectUniformLocation(state, p, 'u_opacity');
    const hasBackdropLoc = getGlEffectUniformLocation(state, p, 'u_hasBackdrop');
    if (modeLoc !== null) gl.uniform1i(modeLoc, modeIndex);
    if (opacityLoc !== null) gl.uniform1f(opacityLoc, opacity);
    if (hasBackdropLoc !== null) gl.uniform1i(hasBackdropLoc, hasBackdrop ? 1 : 0);
  });
}

export const defaultGlBlendEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBlendEffectToGl(ctx.state, ctx.source, ctx.dest, effect as BlendEffect);
};

// Maps an AdvancedBlendMode string to the integer the fragment shader switches on. Kept in lockstep with
// the BLEND_FRAGMENT_SRC branch order; an unknown mode maps to -1 (Normal passthrough in the shader).
export function getBlendEffectModeIndex(mode: AdvancedBlendMode): number {
  return BLEND_MODE_INDEX[mode] ?? -1;
}

// Returns the backdrop texture registered under `backdropKey` for this state, or null when the key is
// null/absent or nothing is registered. Doubles as the introspection query for the passthrough fallback.
export function getGlBlendEffectBackdrop(state: GlRenderState, backdropKey: string | null): WebGLTexture | null {
  if (backdropKey === null) return null;
  return _backdrops.get(state)?.get(backdropKey) ?? null;
}

// Registers a backdrop texture under `backdropKey` for this state, so a BlendEffect naming that key
// blends its layer over the texture. Last write wins. Pass a texture produced by the caller (e.g. a
// prior render target's `.texture`); the registry holds the handle only and never owns/frees it.
export function registerGlBlendEffectBackdrop(state: GlRenderState, backdropKey: string, texture: WebGLTexture): void {
  let registry = _backdrops.get(state);
  if (registry === undefined) {
    registry = new Map();
    _backdrops.set(state, registry);
  }
  registry.set(backdropKey, texture);
}

// Removes the backdrop registered under `backdropKey` for this state, returning true if one was present.
// The texture itself is the caller's to free; this only drops the registry reference.
export function unregisterGlBlendEffectBackdrop(state: GlRenderState, backdropKey: string): boolean {
  return _backdrops.get(state)?.delete(backdropKey) ?? false;
}

// AdvancedBlendMode → shader branch index. Alphabetical by value; kept in lockstep with the switch in
// BLEND_FRAGMENT_SRC. The four HSL modes (Color/Hue/Luminosity/Saturation) take indices 7..10.
const BLEND_MODE_INDEX: Readonly<Record<string, number>> = {
  [AdvancedBlendModeValues.Overlay]: 0,
  [AdvancedBlendModeValues.HardLight]: 1,
  [AdvancedBlendModeValues.SoftLight]: 2,
  [AdvancedBlendModeValues.Difference]: 3,
  [AdvancedBlendModeValues.Exclusion]: 4,
  [AdvancedBlendModeValues.ColorDodge]: 5,
  [AdvancedBlendModeValues.ColorBurn]: 6,
  [AdvancedBlendModeValues.Hue]: 7,
  [AdvancedBlendModeValues.Saturation]: 8,
  [AdvancedBlendModeValues.Color]: 9,
  [AdvancedBlendModeValues.Luminosity]: 10,
};

// Per-state backdrop registry. Off the render-state runtime type, freed with the state. Holds texture
// handles only — never owns or frees them.
const _backdrops = new WeakMap<GlRenderState, Map<string, WebGLTexture>>();

// The advanced-blend fragment shader. Layer = u_texture0 (premultiplied), backdrop = u_texture1. Both are
// un-premultiplied to straight RGB for the blend math, blended via the mode's B(cb, cs), then the blended
// color is composited over the backdrop with W3C mixing (cs' = (1 - ab)*cs + ab*B) and Porter-Duff
// source-over, re-premultiplied on output. The separable/HSL formulas mirror effects/blendModeMath.ts.
const BLEND_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform int u_mode;
uniform float u_opacity;
uniform int u_hasBackdrop;
out vec4 o_color;

float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
float sat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }

vec3 clipColor(vec3 c) {
  float l = lum(c);
  float mn = min(min(c.r, c.g), c.b);
  float mx = max(max(c.r, c.g), c.b);
  if (mn < 0.0) c = l + (c - l) * l / (l - mn);
  if (mx > 1.0) c = l + (c - l) * (1.0 - l) / (mx - l);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }

vec3 setSat(vec3 c, float s) {
  // Resolve min/mid/max channels, rescale mid+max to s, pin min to 0. Branchy but only three channels.
  float mn = min(min(c.r, c.g), c.b);
  float mx = max(max(c.r, c.g), c.b);
  float md = (c.r + c.g + c.b) - mn - mx;
  vec3 o;
  float rmid = (mx > mn) ? (md - mn) * s / (mx - mn) : 0.0;
  float rmax = (mx > mn) ? s : 0.0;
  o.r = (c.r == mx) ? rmax : ((c.r == mn) ? 0.0 : rmid);
  o.g = (c.g == mx) ? rmax : ((c.g == mn) ? 0.0 : rmid);
  o.b = (c.b == mx) ? rmax : ((c.b == mn) ? 0.0 : rmid);
  return o;
}

float sepChannel(int mode, float cb, float cs) {
  if (mode == 0) return cb <= 0.5 ? 2.0 * cb * cs : 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs);      // Overlay
  if (mode == 1) return cs <= 0.5 ? 2.0 * cb * cs : 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs);      // HardLight
  if (mode == 2) {                                                                             // SoftLight
    float d = cb <= 0.25 ? ((16.0 * cb - 12.0) * cb + 4.0) * cb : sqrt(cb);
    return cs <= 0.5 ? cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb) : cb + (2.0 * cs - 1.0) * (d - cb);
  }
  if (mode == 3) return abs(cb - cs);                                                          // Difference
  if (mode == 4) return cb + cs - 2.0 * cb * cs;                                               // Exclusion
  if (mode == 5) return cb <= 0.0 ? 0.0 : (cs >= 1.0 ? 1.0 : min(1.0, cb / (1.0 - cs)));       // ColorDodge
  if (mode == 6) return cb >= 1.0 ? 1.0 : (cs <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb) / cs)); // ColorBurn
  return cs;                                                                                   // Normal
}

vec3 blendRgb(int mode, vec3 cb, vec3 cs) {
  if (mode == 7) return setLum(setSat(cs, sat(cb)), lum(cb));  // Hue
  if (mode == 8) return setLum(setSat(cb, sat(cs)), lum(cb));  // Saturation
  if (mode == 9) return setLum(cs, lum(cb));                   // Color
  if (mode == 10) return setLum(cb, lum(cs));                  // Luminosity
  return vec3(sepChannel(mode, cb.r, cs.r), sepChannel(mode, cb.g, cs.g), sepChannel(mode, cb.b, cs.b));
}

void main() {
  vec4 layer = texture(u_texture0, v_texCoord);
  // No backdrop registered: the blend has nothing to read, so pass the layer through unchanged.
  if (u_hasBackdrop == 0) { o_color = layer; return; }
  vec4 back = texture(u_texture1, v_texCoord);

  // Un-premultiply to straight RGB for the blend math.
  vec3 cs = layer.a > 0.0 ? layer.rgb / layer.a : vec3(0.0);
  vec3 cb = back.a > 0.0 ? back.rgb / back.a : vec3(0.0);
  float as = layer.a * u_opacity;
  float ab = back.a;

  // W3C blend mixing: the blended color contributes only where the backdrop is opaque; elsewhere the
  // straight source shows through. cs' = (1 - ab) * cs + ab * B(cb, cs).
  vec3 blended = blendRgb(u_mode, cb, cs);
  vec3 mixed = (1.0 - ab) * cs + ab * blended;

  // Porter-Duff source-over of the (mixed) layer onto the backdrop, output premultiplied.
  float outA = as + ab * (1.0 - as);
  vec3 outRgb = mixed * as + cb * ab * (1.0 - as);
  o_color = vec4(outRgb, outA);
}`;
