//! GL lens / camera artifact effect recipes.
//!
//! Each recipe is a single-pass fragment shader except bokeh DoF, which reads
//! the depth texture from `ctx.scene_depth_texture` when present (real CoC
//! path) and falls back to a uniform disc blur when absent.  Each program is
//! keyed and compiled once per state via `get_gl_effect_program`, then drawn
//! with `draw_gl_effect_fullscreen_pass`.  Shaders work in centered
//! coordinates (`v_texCoord - 0.5`) so radial math measures distance from the
//! optical center.  Packed RGBA color ints are unpacked to normalized floats
//! before upload as uniforms.
//!
//! Mirrors the TS `lensEffects` from `effects-webgl` and the WGPU
//! `lens_effects` from `effects-wgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    BokehDepthOfFieldEffect, ChromaticAberrationEffect, DisplacementEffect, LensDirtEffect,
    LensDistortionEffect, LensFlareEffect, TiltShiftEffect, VignetteEffect,
};
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

// ---------------------------------------------------------------------------
// Recipe functions
// ---------------------------------------------------------------------------

/// Applies bokeh depth-of-field to `source` and writes to `dest`.
///
/// When `depth_texture` is `Some`, the circle of confusion is computed per
/// fragment from `focus_distance`/`focus_range`.  When `None`, a uniform disc
/// blur of radius `max_blur` is applied instead.
pub fn apply_bokeh_depth_of_field_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    depth_texture: Option<glow::Texture>,
    effect: &BokehDepthOfFieldEffect,
) {
    let max_blur = effect.max_blur.unwrap_or(4.0);
    let focus_distance = effect.focus_distance.unwrap_or(0.5);
    let focus_range = effect.focus_range.unwrap_or(0.2);
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.bokehDoF", BOKEH_DOF_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    let inputs: Vec<glow::Texture> = match depth_texture {
        Some(depth) => vec![texture, depth],
        None => vec![texture],
    };
    let has_depth = if depth_texture.is_some() { 1.0 } else { 0.0 };
    draw_gl_effect_fullscreen_pass(state, program, &inputs, Some(dest), move |gl, p| unsafe {
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_maxBlur").as_ref(), max_blur);
        gl.uniform_2_f32(
            gl.get_uniform_location(p, "u_resolution").as_ref(),
            width,
            height,
        );
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_focusDistance").as_ref(),
            focus_distance,
        );
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_focusRange").as_ref(),
            focus_range,
        );
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_hasDepth").as_ref(), has_depth);
    });
}

/// Applies chromatic aberration to `source` and writes to `dest`.
pub fn apply_chromatic_aberration_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &ChromaticAberrationEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.005);
    let radial = if effect.radial.unwrap_or(true) {
        1.0
    } else {
        0.0
    };
    let texture = source.texture;

    let program = get_gl_effect_program(
        state,
        "lens.chromaticAberration",
        CHROMATIC_ABERRATION_FRAGMENT_SRC,
    );
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_radial").as_ref(), radial);
        },
    );
}

/// Applies displacement / heat-haze warp to `source` and writes to `dest`.
pub fn apply_displacement_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &DisplacementEffect,
) {
    let intensity = effect.intensity.unwrap_or(8.0);
    let frequency = effect.frequency.unwrap_or(12.0);
    let seed = effect.seed.unwrap_or(0.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.displacement", DISPLACEMENT_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_frequency").as_ref(),
                frequency,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_seed").as_ref(), seed);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies lens-dirt overlay to `source` and writes to `dest`.
pub fn apply_lens_dirt_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &LensDirtEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let threshold = effect.threshold.unwrap_or(0.55);
    let seed = effect.seed.unwrap_or(0.0);
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.lensDirt", LENS_DIRT_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_threshold").as_ref(),
                threshold,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_seed").as_ref(), seed);
        },
    );
}

/// Applies barrel/pincushion lens distortion to `source` and writes to `dest`.
pub fn apply_lens_distortion_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &LensDistortionEffect,
) {
    let amount = effect.amount.unwrap_or(0.2);
    let scale = effect.scale.unwrap_or(1.0);
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.lensDistortion", LENS_DISTORTION_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_amount").as_ref(), amount);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_scale").as_ref(), scale);
        },
    );
}

/// Applies lens-flare ghosts + halo to `source` and writes to `dest`.
pub fn apply_lens_flare_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &LensFlareEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.8);
    let intensity = effect.intensity.unwrap_or(1.0);
    let ghosts = effect.ghosts.unwrap_or(4) as f32;
    let halo = effect.halo.unwrap_or(0.5);
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.lensFlare", LENS_FLARE_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_threshold").as_ref(),
                threshold,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_ghosts").as_ref(), ghosts);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_halo").as_ref(), halo);
        },
    );
}

/// Applies tilt-shift blur to `source` and writes to `dest`.
pub fn apply_tilt_shift_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &TiltShiftEffect,
) {
    let center = effect.center.unwrap_or(0.5);
    let width_param = effect.width.unwrap_or(0.3);
    let blur = effect.blur.unwrap_or(4.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.tiltShift", TILT_SHIFT_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_center").as_ref(), center);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_width").as_ref(), width_param);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_blur").as_ref(), blur);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies vignette darkening to `source` and writes to `dest`.
pub fn apply_vignette_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &VignetteEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let radius = effect.radius.unwrap_or(0.75);
    let softness = effect.softness.unwrap_or(0.45);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "lens.vignette", VIGNETTE_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_radius").as_ref(), radius);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_softness").as_ref(), softness);
            gl.uniform_4_f32(gl.get_uniform_location(p, "u_color").as_ref(), r, g, b, a);
        },
    );
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`BokehDepthOfFieldEffect`].
pub const DEFAULT_GL_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::BokehDepthOfField(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_bokeh_depth_of_field_effect_to_gl(
                state,
                ctx.source,
                ctx.dest,
                ctx.scene_depth_texture,
                effect,
            );
        }
    };

/// Default GL runner for [`ChromaticAberrationEffect`].
pub const DEFAULT_GL_CHROMATIC_ABERRATION_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ChromaticAberration(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_chromatic_aberration_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`DisplacementEffect`].
pub const DEFAULT_GL_DISPLACEMENT_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Displacement(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_displacement_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`LensDirtEffect`].
pub const DEFAULT_GL_LENS_DIRT_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LensDirt(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_lens_dirt_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`LensDistortionEffect`].
pub const DEFAULT_GL_LENS_DISTORTION_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LensDistortion(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_lens_distortion_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`LensFlareEffect`].
pub const DEFAULT_GL_LENS_FLARE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LensFlare(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_lens_flare_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`TiltShiftEffect`].
pub const DEFAULT_GL_TILT_SHIFT_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::TiltShift(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_tilt_shift_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`VignetteEffect`].
pub const DEFAULT_GL_VIGNETTE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Vignette(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_vignette_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

// ---------------------------------------------------------------------------
// Fragment sources
// ---------------------------------------------------------------------------

const BOKEH_DOF_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_maxBlur;
uniform vec2 u_resolution;
uniform float u_focusDistance;
uniform float u_focusRange;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  // Circle of confusion: with depth, blur scales by distance from the focus plane; without, full blur.
  float coc = 1.0;
  if (u_hasDepth > 0.5) {
    float depth = texture(u_texture1, v_texCoord).r;
    coc = clamp(abs(depth - u_focusDistance) / max(u_focusRange, 1e-4), 0.0, 1.0);
  }
  float blur = u_maxBlur * coc;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.39269908; // golden-ish angular step over the disc
    float r = (float(i % 4) + 1.0) * 0.25;
    vec2 offset = vec2(cos(a), sin(a)) * r * blur * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}";

const CHROMATIC_ABERRATION_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radial;
out vec4 o_color;
void main() {
  vec2 centered = v_texCoord - 0.5;
  float scale = mix(1.0, length(centered) * 2.0, u_radial);
  vec2 dir = mix(vec2(1.0, 0.0), normalize(centered + vec2(1e-5)), u_radial);
  vec2 offset = dir * u_intensity * scale;
  float r = texture(u_texture0, v_texCoord + offset).r;
  float g = texture(u_texture0, v_texCoord).g;
  float b = texture(u_texture0, v_texCoord - offset).b;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(r, g, b, a);
}";

const DISPLACEMENT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_frequency;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  float f = u_frequency;
  vec2 warp = vec2(
    sin(v_texCoord.y * f + u_seed) + sin(v_texCoord.y * f * 2.3 + u_seed * 1.7) * 0.5,
    cos(v_texCoord.x * f * 0.8 + u_seed * 1.3)
  );
  vec2 displaced = v_texCoord + warp * (u_intensity / u_resolution);
  o_color = texture(u_texture0, displaced);
}";

const LENS_DIRT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_threshold;
uniform float u_seed;
out vec4 o_color;
float dirtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float dirtAmount(vec2 uv, float seed) {
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 c = vec2(dirtHash(vec2(fi, seed)), dirtHash(vec2(fi + 9.0, seed)));
    float r = 0.06 + 0.16 * dirtHash(vec2(fi + 3.0, seed));
    float d = distance(uv, c) / r;
    acc += smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float bright = max(0.0, lum - u_threshold);
  float dirt = dirtAmount(v_texCoord, u_seed + 1.0);
  o_color = vec4(c.rgb + bright * dirt * u_intensity * 2.0, c.a);
}";

const LENS_DISTORTION_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform float u_scale;
out vec4 o_color;
void main() {
  vec2 centered = (v_texCoord - 0.5) / u_scale;
  float r2 = dot(centered, centered);
  vec2 distorted = centered * (1.0 + u_amount * r2) + 0.5;
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    o_color = texture(u_texture0, distorted);
  }
}";

const LENS_FLARE_FRAGMENT_SRC: &str = "#version 300 es
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
}";

const TILT_SHIFT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_center;
uniform float u_width;
uniform float u_blur;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  float dist = abs(v_texCoord.y - u_center);
  float edge = u_width * 0.5;
  float amount = smoothstep(edge, edge + u_width, dist);
  float radius = amount * u_blur;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 offset = vec2(0.0, float(i)) * radius * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}";

const VIGNETTE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radius;
uniform float u_softness;
uniform vec4 u_color;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec2 centered = v_texCoord - 0.5;
  float dist = length(centered) * 1.41421356;
  float vig = smoothstep(u_radius, u_radius - u_softness, dist);
  float darken = (1.0 - vig) * u_intensity * u_color.a;
  o_color = vec4(mix(c.rgb, u_color.rgb, darken), c.a);
}";

#[cfg(test)]
mod tests {
    use super::*;

    // BOKEH_DOF_FRAGMENT_SRC

    #[test]
    fn bokeh_dof_fragment_src_samples_depth_for_circle_of_confusion() {
        assert!(BOKEH_DOF_FRAGMENT_SRC.contains("#version 300 es"));
        assert!(BOKEH_DOF_FRAGMENT_SRC.contains("uniform sampler2D u_texture1"));
        assert!(BOKEH_DOF_FRAGMENT_SRC.contains("u_hasDepth > 0.5"));
        assert!(BOKEH_DOF_FRAGMENT_SRC.contains("u_maxBlur * coc"));
    }

    // CHROMATIC_ABERRATION_FRAGMENT_SRC

    #[test]
    fn chromatic_aberration_fragment_src_supports_radial_flag() {
        assert!(CHROMATIC_ABERRATION_FRAGMENT_SRC.contains("u_radial"));
        // R/G/B are sampled at offset/zero/-offset.
        assert!(CHROMATIC_ABERRATION_FRAGMENT_SRC.contains("v_texCoord + offset"));
        assert!(CHROMATIC_ABERRATION_FRAGMENT_SRC.contains("v_texCoord - offset"));
    }

    // DISPLACEMENT_FRAGMENT_SRC

    #[test]
    fn displacement_fragment_src_warps_by_sine_field() {
        assert!(DISPLACEMENT_FRAGMENT_SRC.contains("u_frequency"));
        assert!(DISPLACEMENT_FRAGMENT_SRC.contains("warp * (u_intensity / u_resolution)"));
    }

    // LENS_DIRT_FRAGMENT_SRC

    #[test]
    fn lens_dirt_fragment_src_accumulates_procedural_smudges() {
        assert!(LENS_DIRT_FRAGMENT_SRC.contains("float dirtAmount"));
        assert!(LENS_DIRT_FRAGMENT_SRC.contains("u_threshold"));
    }

    // LENS_DISTORTION_FRAGMENT_SRC

    #[test]
    fn lens_distortion_fragment_src_remaps_radially() {
        assert!(LENS_DISTORTION_FRAGMENT_SRC.contains("1.0 + u_amount * r2"));
    }

    // LENS_FLARE_FRAGMENT_SRC

    #[test]
    fn lens_flare_fragment_src_walks_ghost_samples() {
        assert!(LENS_FLARE_FRAGMENT_SRC.contains("vec3 brightPass"));
        assert!(LENS_FLARE_FRAGMENT_SRC.contains("u_ghosts"));
        assert!(LENS_FLARE_FRAGMENT_SRC.contains("u_halo"));
    }

    // TILT_SHIFT_FRAGMENT_SRC

    #[test]
    fn tilt_shift_fragment_src_blurs_outside_focus_band() {
        assert!(TILT_SHIFT_FRAGMENT_SRC.contains("u_center"));
        assert!(TILT_SHIFT_FRAGMENT_SRC.contains("amount * u_blur"));
    }

    // VIGNETTE_FRAGMENT_SRC

    #[test]
    fn vignette_fragment_src_darkens_toward_edges() {
        assert!(VIGNETTE_FRAGMENT_SRC.contains("uniform vec4 u_color"));
        assert!(VIGNETTE_FRAGMENT_SRC.contains("u_softness"));
        assert!(VIGNETTE_FRAGMENT_SRC.contains("mix(c.rgb, u_color.rgb, darken)"));
    }
}
