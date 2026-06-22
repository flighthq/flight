//! WGPU color-grading effect recipes.
//!
//! Each is a single fullscreen pass.  Packed RGBA integer fields
//! (`lift`/`gamma`/`gain`) are unpacked to normalized floats before upload.
//!
//! Mirrors the TS `colorGradeEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    BrightnessContrastEffect, ChannelMixerEffect, ColorGradeEffect, GrayscaleEffect,
    HueSaturationEffect, InvertEffect, LiftGammaGainEffect, LookupTableGradeEffect,
    PosterizeEffect, SepiaEffect, WhiteBalanceEffect,
};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_effect_filter_pass, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies brightness/contrast to `source` and writes to `dest`.
pub fn apply_brightness_contrast_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &BrightnessContrastEffect,
) {
    let brightness = effect.brightness.unwrap_or(0.0);
    let contrast = effect.contrast.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.brightnessContrast",
        BRIGHTNESS_CONTRAST_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.brightnessContrast",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = brightness;
            f32s[1] = contrast;
        },
    );
}

/// Applies a channel mixer matrix to `source` and writes to `dest`.
pub fn apply_channel_mixer_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &ChannelMixerEffect,
) {
    let matrix = effect.matrix;
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.channelMixer",
        CHANNEL_MIXER_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.channelMixer",
        source,
        Some(dest),
        |f32s, _| {
            for (i, v) in matrix.iter().enumerate() {
                f32s[i] = *v;
            }
        },
    );
}

/// Applies a combined color grade to `source` and writes to `dest`.
pub fn apply_color_grade_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &ColorGradeEffect,
) {
    let exposure = 2.0f32.powf(effect.exposure.unwrap_or(0.0));
    let contrast = effect.contrast.unwrap_or(1.0);
    let saturation = effect.saturation.unwrap_or(1.0);
    let temperature = effect.temperature.unwrap_or(0.0);
    let tint = effect.tint.unwrap_or(0.0);
    let brightness = effect.brightness.unwrap_or(0.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.colorGrade",
        COLOR_GRADE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.colorGrade",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = exposure;
            f32s[1] = contrast;
            f32s[2] = saturation;
            f32s[3] = temperature;
            f32s[4] = tint;
            f32s[5] = brightness;
        },
    );
}

/// Applies grayscale conversion to `source` and writes to `dest`.
pub fn apply_grayscale_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &GrayscaleEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.grayscale",
        GRAYSCALE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.grayscale",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
        },
    );
}

/// Applies hue/saturation/lightness to `source` and writes to `dest`.
pub fn apply_hue_saturation_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &HueSaturationEffect,
) {
    let hue = effect.hue.unwrap_or(0.0) / 360.0;
    let saturation = effect.saturation.unwrap_or(1.0);
    let lightness = effect.lightness.unwrap_or(0.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.hueSaturation",
        HUE_SATURATION_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.hueSaturation",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = hue;
            f32s[1] = saturation;
            f32s[2] = lightness;
        },
    );
}

/// Applies color inversion to `source` and writes to `dest`.
pub fn apply_invert_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &InvertEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.invert",
        INVERT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "colorGrade.invert", source, Some(dest), |f32s, _| {
        f32s[0] = intensity;
    });
}

/// Applies lift/gamma/gain grading to `source` and writes to `dest`.
pub fn apply_lift_gamma_gain_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
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
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.liftGammaGain",
        LIFT_GAMMA_GAIN_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.liftGammaGain",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = lift[0];
            f32s[1] = lift[1];
            f32s[2] = lift[2];
            f32s[4] = gamma[0];
            f32s[5] = gamma[1];
            f32s[6] = gamma[2];
            f32s[8] = gain[0];
            f32s[9] = gain[1];
            f32s[10] = gain[2];
        },
    );
}

/// Applies a 3-D LUT grade to `source` and writes to `dest`.
///
/// A real 3D LUT grade samples an uploaded LUT cube texture per pixel; that
/// texture path is not yet wired, so this keeps the pass compiling and
/// color-neutral (mix toward an unchanged grade by `strength`).
pub fn apply_lookup_table_grade_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &LookupTableGradeEffect,
) {
    let strength = effect.strength.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.lutGrade",
        LUT_GRADE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.lutGrade",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = strength;
        },
    );
}

/// Applies posterization to `source` and writes to `dest`.
pub fn apply_posterize_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &PosterizeEffect,
) {
    let levels = effect.levels.unwrap_or(8).max(2) as f32;
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.posterize",
        POSTERIZE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.posterize",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = levels;
        },
    );
}

/// Applies a sepia tone to `source` and writes to `dest`.
pub fn apply_sepia_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &SepiaEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.sepia",
        SEPIA_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "colorGrade.sepia", source, Some(dest), |f32s, _| {
        f32s[0] = intensity;
    });
}

/// Applies white balance to `source` and writes to `dest`.
pub fn apply_white_balance_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &WhiteBalanceEffect,
) {
    let temperature = effect.temperature.unwrap_or(0.0);
    let tint = effect.tint.unwrap_or(0.0);
    get_wgpu_effect_pipeline(
        state,
        "colorGrade.whiteBalance",
        WHITE_BALANCE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "colorGrade.whiteBalance",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = temperature;
            f32s[1] = tint;
        },
    );
}

/// Default WGPU runner for [`BrightnessContrastEffect`].
pub const DEFAULT_WGPU_BRIGHTNESS_CONTRAST_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::BrightnessContrast(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_brightness_contrast_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`ChannelMixerEffect`].
pub const DEFAULT_WGPU_CHANNEL_MIXER_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ChannelMixer(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_channel_mixer_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`ColorGradeEffect`].
pub const DEFAULT_WGPU_COLOR_GRADE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ColorGrade(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_color_grade_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`GrayscaleEffect`].
pub const DEFAULT_WGPU_GRAYSCALE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Grayscale(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_grayscale_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`HueSaturationEffect`].
pub const DEFAULT_WGPU_HUE_SATURATION_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::HueSaturation(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_hue_saturation_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`InvertEffect`].
pub const DEFAULT_WGPU_INVERT_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Invert(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_invert_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`LiftGammaGainEffect`].
pub const DEFAULT_WGPU_LIFT_GAMMA_GAIN_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LiftGammaGain(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_lift_gamma_gain_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`LookupTableGradeEffect`].
pub const DEFAULT_WGPU_LOOKUP_TABLE_GRADE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LookupTableGrade(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_lookup_table_grade_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`PosterizeEffect`].
pub const DEFAULT_WGPU_POSTERIZE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Posterize(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_posterize_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`SepiaEffect`].
pub const DEFAULT_WGPU_SEPIA_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Sepia(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_sepia_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`WhiteBalanceEffect`].
pub const DEFAULT_WGPU_WHITE_BALANCE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::WhiteBalance(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_white_balance_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

// Unpack a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b] floats.
// Alpha is dropped — these grade values describe RGB channels only.
fn unpack_color(c: u32) -> [f32; 3] {
    [
        ((c >> 24) & 0xff) as f32 / 255.0,
        ((c >> 16) & 0xff) as f32 / 255.0,
        ((c >> 8) & 0xff) as f32 / 255.0,
    ]
}

// Slot layout: [0]=brightness, [1]=contrast.
const BRIGHTNESS_CONTRAST_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_brightness : f32, u_contrast : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = (c.rgb + uni.u_brightness - 0.5) * uni.u_contrast + 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

// Slot layout: three vec4f rows, each 16-byte aligned — [0..3]=row r, [4..7]=row g, [8..11]=row b.
const CHANNEL_MIXER_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_row_r : vec4f, u_row_g : vec4f, u_row_b : vec4f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let r = uni.u_row_r.x * c.r + uni.u_row_r.y * c.g + uni.u_row_r.z * c.b + uni.u_row_r.w;
  let g = uni.u_row_g.x * c.r + uni.u_row_g.y * c.g + uni.u_row_g.z * c.b + uni.u_row_g.w;
  let b = uni.u_row_b.x * c.r + uni.u_row_b.y * c.g + uni.u_row_b.z * c.b + uni.u_row_b.w;
  return vec4f(clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0)), c.a);
}"#;

// Slot layout: [0]=exposure, [1]=contrast, [2]=saturation, [3]=temperature, [4]=tint, [5]=brightness.
const COLOR_GRADE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_exposure : f32,
  u_contrast : f32,
  u_saturation : f32,
  u_temperature : f32,
  u_tint : f32,
  u_brightness : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb * uni.u_exposure + uni.u_brightness;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  let l = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3f(l), rgb, uni.u_saturation);
  rgb = (rgb - 0.5) * uni.u_contrast + 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

// Slot layout: [0]=intensity.
const GRAYSCALE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let l = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(mix(c.rgb, vec3f(l), uni.u_intensity), c.a);
}"#;

// Slot layout: [0]=hue (turns), [1]=saturation, [2]=lightness.
const HUE_SATURATION_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_hue : f32, u_saturation : f32, u_lightness : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn rgb2hsl(c : vec3f) -> vec3f {
  let mx = max(c.r, max(c.g, c.b));
  let mn = min(c.r, min(c.g, c.b));
  let l = (mx + mn) * 0.5;
  var h = 0.0;
  var s = 0.0;
  let d = mx - mn;
  if (d > 0.0001) {
    s = select(d / (2.0 - mx - mn), d / (mx + mn), l < 0.5);
    if (mx == c.r) {
      h = (c.g - c.b) / d + select(0.0, 6.0, c.g < c.b);
    } else if (mx == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3f(h, s, l);
}

fn hue2rgb(p : f32, q : f32, t_in : f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 1.0 / 2.0) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl2rgb(hsl : vec3f) -> vec3f {
  let h = hsl.x;
  let s = hsl.y;
  let l = hsl.z;
  if (s <= 0.0) { return vec3f(l); }
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3f(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + uni.u_hue);
  hsl.y = clamp(hsl.y * uni.u_saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + uni.u_lightness, 0.0, 1.0);
  return vec4f(hsl2rgb(hsl), c.a);
}"#;

// Slot layout: [0]=intensity.
const INVERT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(mix(c.rgb, vec3f(1.0) - c.rgb, uni.u_intensity), c.a);
}"#;

// Slot layout: three vec3 in 16-byte-aligned slots — [0..2]=lift, [4..6]=gamma, [8..10]=gain.
const LIFT_GAMMA_GAIN_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_lift : vec3f, u_gamma : vec3f, u_gain : vec3f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb * uni.u_gain + uni.u_lift * (vec3f(1.0) - c.rgb);
  rgb = pow(max(rgb, vec3f(0.0)), uni.u_gamma);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

// Slot layout: [0]=strength.
const LUT_GRADE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_strength : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  // Passthrough: a real 3D LUT samples an uploaded LUT cube texture here, then mixes by u_strength.
  let graded = c.rgb;
  return vec4f(mix(c.rgb, graded, uni.u_strength), c.a);
}"#;

// Slot layout: [0]=levels.
const POSTERIZE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_levels : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = floor(c.rgb * uni.u_levels) / (uni.u_levels - 1.0);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

// Slot layout: [0]=intensity.
const SEPIA_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let sepia = vec3f(
    dot(c.rgb, vec3f(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3f(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3f(0.272, 0.534, 0.131))
  );
  return vec4f(mix(c.rgb, sepia, uni.u_intensity), c.a);
}"#;

// Slot layout: [0]=temperature, [1]=tint.
const WHITE_BALANCE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_temperature : f32, u_tint : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn unpack_color_splits_packed_rgba() {
        // 0xff8000ff → r=1.0, g≈0.502, b=0.0 (alpha dropped).
        let [r, g, b] = unpack_color(0xff8000ff);
        assert_eq!(r, 1.0);
        assert!((g - 0.5019608).abs() < 1e-5);
        assert_eq!(b, 0.0);
    }

    #[test]
    fn lift_gamma_gain_fragment_declares_three_vec3() {
        let module = build_wgpu_effect_module_wgsl(LIFT_GAMMA_GAIN_FRAGMENT_WGSL);
        assert!(module.contains("u_lift : vec3f"));
        assert!(module.contains("u_gamma : vec3f"));
        assert!(module.contains("u_gain : vec3f"));
    }

    #[test]
    fn channel_mixer_fragment_declares_three_rows() {
        let module = build_wgpu_effect_module_wgsl(CHANNEL_MIXER_FRAGMENT_WGSL);
        assert!(module.contains("u_row_r : vec4f"));
        assert!(module.contains("u_row_g : vec4f"));
        assert!(module.contains("u_row_b : vec4f"));
    }
}
