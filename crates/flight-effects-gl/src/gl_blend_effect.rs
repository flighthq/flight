// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, hold native texture names and return Result diagnostics
//! Backdrop-aware advanced blend: composites the layer over a registered backdrop texture with one of
//! the separable or HSL advanced blend modes. Backdrops are registered per render state by key.

use flight_effects::{
    ADVANCED_BLEND_MODE_COLOR, ADVANCED_BLEND_MODE_COLOR_BURN, ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN, ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_HUE, ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY, ADVANCED_BLEND_MODE_OVERLAY, ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT, BlendEffect, Effect,
};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};
use glow::NativeTexture;

use crate::contract::{
    GlEffectContext, get_gl_effect_program, get_gl_effect_uniform_location, register_gl_effect,
};
use crate::gl_effect_support::{set_uniform_1f, set_uniform_1i, with_gl_effect_state_runtime};

pub const BLEND_FRAGMENT_SRC: &str = r#"#version 300 es
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
  if (mode == 11) return min(cb, cs);                                                          // Darken
  if (mode == 12) return max(cb, cs);                                                          // Lighten
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
}"#;

const BLEND_MODE_INDEX: [(&str, i32); 13] = [
    (ADVANCED_BLEND_MODE_OVERLAY, 0),
    (ADVANCED_BLEND_MODE_HARD_LIGHT, 1),
    (ADVANCED_BLEND_MODE_SOFT_LIGHT, 2),
    (ADVANCED_BLEND_MODE_DIFFERENCE, 3),
    (ADVANCED_BLEND_MODE_EXCLUSION, 4),
    (ADVANCED_BLEND_MODE_COLOR_DODGE, 5),
    (ADVANCED_BLEND_MODE_COLOR_BURN, 6),
    (ADVANCED_BLEND_MODE_HUE, 7),
    (ADVANCED_BLEND_MODE_SATURATION, 8),
    (ADVANCED_BLEND_MODE_COLOR, 9),
    (ADVANCED_BLEND_MODE_LUMINOSITY, 10),
    (ADVANCED_BLEND_MODE_DARKEN, 11),
    (ADVANCED_BLEND_MODE_LIGHTEN, 12),
];

pub fn apply_blend_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &BlendEffect,
) -> Result<(), String> {
    let backdrop = get_gl_blend_effect_backdrop(state, effect.backdrop_key.as_deref());
    let program = get_gl_effect_program(state, "blend.advanced", BLEND_FRAGMENT_SRC)?;
    let mode_index = get_blend_effect_mode_index(&effect.mode);
    let opacity = effect.opacity.unwrap_or(1.0);
    let has_backdrop = backdrop.is_some();

    let inputs = [source.texture, backdrop.unwrap_or(source.texture)];
    let mode_loc = get_gl_effect_uniform_location(state, &program, "u_mode");
    let opacity_loc = get_gl_effect_uniform_location(state, &program, "u_opacity");
    let has_backdrop_loc = get_gl_effect_uniform_location(state, &program, "u_hasBackdrop");
    return draw_gl_fullscreen_pass(state, &program, &inputs, Some(dest), |gl, _p| {
        if mode_loc.is_some() {
            set_uniform_1i(gl, mode_loc.as_ref(), mode_index);
        }
        if opacity_loc.is_some() {
            set_uniform_1f(gl, opacity_loc.as_ref(), opacity);
        }
        if has_backdrop_loc.is_some() {
            set_uniform_1i(
                gl,
                has_backdrop_loc.as_ref(),
                if has_backdrop { 1 } else { 0 },
            );
        }
    });
}

/// The shader's index for an advanced blend mode, or -1 (Normal passthrough) for an unknown mode.
pub fn get_blend_effect_mode_index(mode: &str) -> i32 {
    return BLEND_MODE_INDEX
        .iter()
        .find(|(name, _)| *name == mode)
        .map_or(-1, |(_, index)| *index);
}

pub fn get_gl_blend_effect_backdrop(
    state: &GlRenderState,
    backdrop_key: Option<&str>,
) -> Option<NativeTexture> {
    let backdrop_key = backdrop_key?;
    return with_gl_effect_state_runtime(state, |runtime| {
        runtime.blend_backdrops.get(backdrop_key).copied()
    });
}

pub fn gl_blend_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<BlendEffect>() else {
        return Ok(());
    };
    return apply_blend_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_blend_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "BlendEffect", gl_blend_effect_runner, None);
}

pub fn register_gl_blend_effect_backdrop(
    state: &GlRenderState,
    backdrop_key: &str,
    texture: NativeTexture,
) {
    with_gl_effect_state_runtime(state, |runtime| {
        runtime
            .blend_backdrops
            .insert(backdrop_key.to_string(), texture);
    });
}

pub fn unregister_gl_blend_effect_backdrop(state: &GlRenderState, backdrop_key: &str) -> bool {
    return with_gl_effect_state_runtime(state, |runtime| {
        runtime.blend_backdrops.remove(backdrop_key).is_some()
    });
}
