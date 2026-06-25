//! GL color-grading effect recipes.
//!
//! Each recipe is a single-pass fragment shader that reads `source`, writes
//! `dest`, and is compiled once per state via `get_gl_effect_program`.
//! Packed RGBA intent fields (lift/gamma/gain/color) are unpacked to
//! normalized floats in the recipe before upload as uniforms.
//!
//! Mirrors the TS `colorGradeEffects` from `effects-webgl`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    BrightnessContrastEffect, ChannelMixerEffect, ColorGradeEffect, GrayscaleEffect,
    HueSaturationEffect, InvertEffect, LiftGammaGainEffect, LookupTableGradeEffect,
    PosterizeEffect, SepiaEffect, WhiteBalanceEffect,
};
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

// ---------------------------------------------------------------------------
// Recipe functions
// ---------------------------------------------------------------------------

/// Applies brightness/contrast to `source` and writes to `dest`.
pub fn apply_brightness_contrast_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &BrightnessContrastEffect,
) {
    let brightness = effect.brightness.unwrap_or(0.0);
    let contrast = effect.contrast.unwrap_or(1.0);
    let texture = source.texture;
    let program = get_gl_effect_program(
        state,
        "colorGrade.brightnessContrast",
        BRIGHTNESS_CONTRAST_FRAGMENT_SRC,
    );
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_brightness").as_ref(),
            brightness,
        );
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_contrast").as_ref(), contrast);
    });
}

/// Applies channel mixing to `source` and writes to `dest`.
pub fn apply_channel_mixer_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &ChannelMixerEffect,
) {
    let matrix = effect.matrix;
    let texture = source.texture;
    let program =
        get_gl_effect_program(state, "colorGrade.channelMixer", CHANNEL_MIXER_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32_slice(gl.get_uniform_location(p, "u_matrix").as_ref(), &matrix);
    });
}

/// Applies combined color grading to `source` and writes to `dest`.
pub fn apply_color_grade_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &ColorGradeEffect,
) {
    let exposure = 2.0f32.powf(effect.exposure.unwrap_or(0.0));
    let contrast = effect.contrast.unwrap_or(1.0);
    let saturation = effect.saturation.unwrap_or(1.0);
    let temperature = effect.temperature.unwrap_or(0.0);
    let tint = effect.tint.unwrap_or(0.0);
    let brightness = effect.brightness.unwrap_or(0.0);
    let texture = source.texture;
    let program = get_gl_effect_program(state, "colorGrade.colorGrade", COLOR_GRADE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_exposure").as_ref(), exposure);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_contrast").as_ref(), contrast);
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_saturation").as_ref(),
            saturation,
        );
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_temperature").as_ref(),
            temperature,
        );
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_tint").as_ref(), tint);
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_brightness").as_ref(),
            brightness,
        );
    });
}

/// Applies grayscale to `source` and writes to `dest`.
pub fn apply_grayscale_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &GrayscaleEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let texture = source.texture;
    let program = get_gl_effect_program(state, "colorGrade.grayscale", GRAYSCALE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_intensity").as_ref(),
            intensity,
        );
    });
}

/// Applies hue/saturation/lightness shift to `source` and writes to `dest`.
pub fn apply_hue_saturation_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &HueSaturationEffect,
) {
    let hue = effect.hue.unwrap_or(0.0) / 360.0;
    let saturation = effect.saturation.unwrap_or(1.0);
    let lightness = effect.lightness.unwrap_or(0.0);
    let texture = source.texture;
    let program = get_gl_effect_program(
        state,
        "colorGrade.hueSaturation",
        HUE_SATURATION_FRAGMENT_SRC,
    );
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_hue").as_ref(), hue);
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_saturation").as_ref(),
            saturation,
        );
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_lightness").as_ref(),
            lightness,
        );
    });
}

/// Applies invert to `source` and writes to `dest`.
pub fn apply_invert_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &InvertEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let texture = source.texture;
    let program = get_gl_effect_program(state, "colorGrade.invert", INVERT_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_intensity").as_ref(),
            intensity,
        );
    });
}

/// Applies lift/gamma/gain to `source` and writes to `dest`.
///
/// Packed RGBA neutral values: lift `0x000000ff`, gamma `0x808080ff`,
/// gain `0xffffffff`.  The recipe unpacks them before uploading as uniforms.
pub fn apply_lift_gamma_gain_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &LiftGammaGainEffect,
) {
    let lift = unpack_color(effect.lift.unwrap_or(0x000000ff));
    let gamma_raw = unpack_color(effect.gamma.unwrap_or(0x808080ff));
    let gain = unpack_color(effect.gain.unwrap_or(0xffffffff));
    // Map gamma's 0.5-neutral to a 1.0-neutral exponent so 0x808080 leaves the image unchanged.
    let gamma = [
        1.0 / (gamma_raw[0] * 2.0).max(1e-3),
        1.0 / (gamma_raw[1] * 2.0).max(1e-3),
        1.0 / (gamma_raw[2] * 2.0).max(1e-3),
    ];
    let texture = source.texture;
    let program = get_gl_effect_program(
        state,
        "colorGrade.liftGammaGain",
        LIFT_GAMMA_GAIN_FRAGMENT_SRC,
    );
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_3_f32(
            gl.get_uniform_location(p, "u_lift").as_ref(),
            lift[0],
            lift[1],
            lift[2],
        );
        gl.uniform_3_f32(
            gl.get_uniform_location(p, "u_gamma").as_ref(),
            gamma[0],
            gamma[1],
            gamma[2],
        );
        gl.uniform_3_f32(
            gl.get_uniform_location(p, "u_gain").as_ref(),
            gain[0],
            gain[1],
            gain[2],
        );
    });
}

/// Applies LUT grade (passthrough until LUT upload is wired) to `source` and
/// writes to `dest`.
pub fn apply_lookup_table_grade_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &LookupTableGradeEffect,
) {
    let strength = effect.strength.unwrap_or(1.0);
    let texture = source.texture;
    let program = get_gl_effect_program(state, "colorGrade.lutGrade", LUT_GRADE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_strength").as_ref(), strength);
    });
}

/// Applies posterization to `source` and writes to `dest`.
pub fn apply_posterize_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &PosterizeEffect,
) {
    let levels = effect.levels.unwrap_or(8).max(2) as f32;
    let texture = source.texture;
    let program = get_gl_effect_program(state, "colorGrade.posterize", POSTERIZE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_levels").as_ref(), levels);
    });
}

/// Applies sepia to `source` and writes to `dest`.
pub fn apply_sepia_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &SepiaEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let texture = source.texture;
    let program = get_gl_effect_program(state, "colorGrade.sepia", SEPIA_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_intensity").as_ref(),
            intensity,
        );
    });
}

/// Applies white balance to `source` and writes to `dest`.
pub fn apply_white_balance_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &WhiteBalanceEffect,
) {
    let temperature = effect.temperature.unwrap_or(0.0);
    let tint = effect.tint.unwrap_or(0.0);
    let texture = source.texture;
    let program =
        get_gl_effect_program(state, "colorGrade.whiteBalance", WHITE_BALANCE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_temperature").as_ref(),
            temperature,
        );
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_tint").as_ref(), tint);
    });
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`BrightnessContrastEffect`].
pub const DEFAULT_GL_BRIGHTNESS_CONTRAST_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::BrightnessContrast(effect) = effect {
            apply_brightness_contrast_effect_to_gl(
                reborrow_state(ctx),
                ctx.source,
                ctx.dest,
                effect,
            );
        }
    };

/// Default GL runner for [`ChannelMixerEffect`].
pub const DEFAULT_GL_CHANNEL_MIXER_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ChannelMixer(effect) = effect {
            apply_channel_mixer_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`ColorGradeEffect`].
pub const DEFAULT_GL_COLOR_GRADE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ColorGrade(effect) = effect {
            apply_color_grade_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`GrayscaleEffect`].
pub const DEFAULT_GL_GRAYSCALE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Grayscale(effect) = effect {
            apply_grayscale_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`HueSaturationEffect`].
pub const DEFAULT_GL_HUE_SATURATION_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::HueSaturation(effect) = effect {
            apply_hue_saturation_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`InvertEffect`].
pub const DEFAULT_GL_INVERT_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Invert(effect) = effect {
            apply_invert_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`LiftGammaGainEffect`].
pub const DEFAULT_GL_LIFT_GAMMA_GAIN_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LiftGammaGain(effect) = effect {
            apply_lift_gamma_gain_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`LookupTableGradeEffect`].
pub const DEFAULT_GL_LOOKUP_TABLE_GRADE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LookupTableGrade(effect) = effect {
            apply_lookup_table_grade_effect_to_gl(
                reborrow_state(ctx),
                ctx.source,
                ctx.dest,
                effect,
            );
        }
    };

/// Default GL runner for [`PosterizeEffect`].
pub const DEFAULT_GL_POSTERIZE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Posterize(effect) = effect {
            apply_posterize_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`SepiaEffect`].
pub const DEFAULT_GL_SEPIA_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Sepia(effect) = effect {
            apply_sepia_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`WhiteBalanceEffect`].
pub const DEFAULT_GL_WHITE_BALANCE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::WhiteBalance(effect) = effect {
            apply_white_balance_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Reborrows the context's render state as a fresh mutable reference. The
// pipeline hands the runner a shared `&GlRenderEffectContext` whose `state`
// field is itself a `&mut GlRenderState`; recipes need that mutability to
// compile/cache programs. The context is owned by the pipeline for the duration
// of the runner call, so the state alias is unique while the runner holds it.
#[allow(clippy::mut_from_ref)]
fn reborrow_state<'a>(ctx: &'a GlRenderEffectContext) -> &'a mut GlRenderState {
    let ptr = ctx.state as *const GlRenderState as *mut GlRenderState;
    // SAFETY: `ctx.state` is the only live reference to the render state for the
    // duration of the runner call; the pipeline does not touch it concurrently.
    unsafe { &mut *ptr }
}

// Unpack a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b] floats.
// Alpha is dropped — these grade values describe RGB channels only.
fn unpack_color(c: u32) -> [f32; 3] {
    [
        ((c >> 24) & 0xff) as f32 / 255.0,
        ((c >> 16) & 0xff) as f32 / 255.0,
        ((c >> 8) & 0xff) as f32 / 255.0,
    ]
}

const BRIGHTNESS_CONTRAST_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_brightness;
uniform float u_contrast;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = (c.rgb + u_brightness - 0.5) * u_contrast + 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}";

const CHANNEL_MIXER_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_matrix[12];
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float r = u_matrix[0] * c.r + u_matrix[1] * c.g + u_matrix[2] * c.b + u_matrix[3];
  float g = u_matrix[4] * c.r + u_matrix[5] * c.g + u_matrix[6] * c.b + u_matrix[7];
  float b = u_matrix[8] * c.r + u_matrix[9] * c.g + u_matrix[10] * c.b + u_matrix[11];
  o_color = vec4(clamp(vec3(r, g, b), 0.0, 1.0), c.a);
}";

const COLOR_GRADE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_tint;
uniform float u_brightness;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb * u_exposure + u_brightness;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  float l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(l), rgb, u_saturation);
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}";

const GRAYSCALE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  o_color = vec4(mix(c.rgb, vec3(l), u_intensity), c.a);
}";

const HUE_SATURATION_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_hue;
uniform float u_saturation;
uniform float u_lightness;
out vec4 o_color;
vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = mx - mn;
  if (d > 0.0001) {
    s = l < 0.5 ? d / (mx + mn) : d / (2.0 - mx - mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + u_hue);
  hsl.y = clamp(hsl.y * u_saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_lightness, 0.0, 1.0);
  o_color = vec4(hsl2rgb(hsl), c.a);
}";

const INVERT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  o_color = vec4(mix(c.rgb, 1.0 - c.rgb, u_intensity), c.a);
}";

const LIFT_GAMMA_GAIN_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb * u_gain + u_lift * (1.0 - c.rgb);
  rgb = pow(max(rgb, 0.0), u_gamma);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}";

const LUT_GRADE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_strength;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  // Passthrough: a real 3D LUT samples an uploaded LUT cube here, then mixes by u_strength.
  vec3 graded = c.rgb;
  o_color = vec4(mix(c.rgb, graded, u_strength), c.a);
}";

const POSTERIZE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = floor(c.rgb * u_levels) / (u_levels - 1.0);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}";

const SEPIA_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 sepia = vec3(
    dot(c.rgb, vec3(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3(0.272, 0.534, 0.131))
  );
  o_color = vec4(mix(c.rgb, sepia, u_intensity), c.a);
}";

const WHITE_BALANCE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_temperature;
uniform float u_tint;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}";

#[cfg(test)]
mod tests {
    use super::*;

    // GLSL source assembly — the CPU-deterministic seam. No GL context is
    // created; we assert the fragment sources declare the uniforms each recipe
    // uploads, mirroring the effects-wgpu sibling's source-assembly tests.

    #[test]
    fn brightness_contrast_fragment_declares_its_uniforms() {
        assert!(BRIGHTNESS_CONTRAST_FRAGMENT_SRC.contains("uniform float u_brightness"));
        assert!(BRIGHTNESS_CONTRAST_FRAGMENT_SRC.contains("uniform float u_contrast"));
        assert!(BRIGHTNESS_CONTRAST_FRAGMENT_SRC.contains("#version 300 es"));
    }

    #[test]
    fn channel_mixer_fragment_declares_twelve_element_matrix() {
        assert!(CHANNEL_MIXER_FRAGMENT_SRC.contains("uniform float u_matrix[12]"));
        assert!(CHANNEL_MIXER_FRAGMENT_SRC.contains("u_matrix[11]"));
    }

    #[test]
    fn color_grade_fragment_declares_its_uniforms() {
        for name in [
            "u_exposure",
            "u_contrast",
            "u_saturation",
            "u_temperature",
            "u_tint",
            "u_brightness",
        ] {
            assert!(
                COLOR_GRADE_FRAGMENT_SRC.contains(&format!("uniform float {name}")),
                "missing uniform {name}"
            );
        }
    }

    #[test]
    fn grayscale_fragment_declares_intensity_uniform() {
        assert!(GRAYSCALE_FRAGMENT_SRC.contains("uniform float u_intensity"));
        assert!(GRAYSCALE_FRAGMENT_SRC.contains("0.2126, 0.7152, 0.0722"));
    }

    #[test]
    fn hue_saturation_fragment_declares_hsl_helpers() {
        assert!(HUE_SATURATION_FRAGMENT_SRC.contains("vec3 rgb2hsl(vec3 c)"));
        assert!(HUE_SATURATION_FRAGMENT_SRC.contains("vec3 hsl2rgb(vec3 hsl)"));
        assert!(HUE_SATURATION_FRAGMENT_SRC.contains("uniform float u_hue"));
    }

    #[test]
    fn invert_fragment_declares_intensity_uniform() {
        assert!(INVERT_FRAGMENT_SRC.contains("uniform float u_intensity"));
        assert!(INVERT_FRAGMENT_SRC.contains("1.0 - c.rgb"));
    }

    #[test]
    fn lift_gamma_gain_fragment_declares_three_vec3() {
        assert!(LIFT_GAMMA_GAIN_FRAGMENT_SRC.contains("uniform vec3 u_lift"));
        assert!(LIFT_GAMMA_GAIN_FRAGMENT_SRC.contains("uniform vec3 u_gamma"));
        assert!(LIFT_GAMMA_GAIN_FRAGMENT_SRC.contains("uniform vec3 u_gain"));
    }

    #[test]
    fn lookup_table_grade_fragment_declares_strength_uniform() {
        assert!(LUT_GRADE_FRAGMENT_SRC.contains("uniform float u_strength"));
    }

    #[test]
    fn posterize_fragment_declares_levels_uniform() {
        assert!(POSTERIZE_FRAGMENT_SRC.contains("uniform float u_levels"));
        assert!(POSTERIZE_FRAGMENT_SRC.contains("floor(c.rgb * u_levels)"));
    }

    #[test]
    fn sepia_fragment_declares_intensity_uniform() {
        assert!(SEPIA_FRAGMENT_SRC.contains("uniform float u_intensity"));
        assert!(SEPIA_FRAGMENT_SRC.contains("0.393, 0.769, 0.189"));
    }

    #[test]
    fn unpack_color_splits_packed_rgba() {
        // 0xff8000ff → r=1.0, g≈0.502, b=0.0 (alpha dropped).
        let [r, g, b] = unpack_color(0xff8000ff);
        assert_eq!(r, 1.0);
        assert!((g - 0.5019608).abs() < 1e-5);
        assert_eq!(b, 0.0);
    }

    #[test]
    fn white_balance_fragment_declares_its_uniforms() {
        assert!(WHITE_BALANCE_FRAGMENT_SRC.contains("uniform float u_temperature"));
        assert!(WHITE_BALANCE_FRAGMENT_SRC.contains("uniform float u_tint"));
    }
}
