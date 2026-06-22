//! GL atmospheric / depth effect recipes.
//!
//! - God rays: radial light scattering (color-only, no depth needed).  The
//!   sample count is baked into the GLSL (a `for` bound must be a constant) and
//!   keyed into the program cache, so each distinct sample count compiles once.
//! - Screen-space fog: real depth-driven recipe when a depth texture is
//!   present; falls back to a screen-Y gradient proxy when absent.
//! - SSAO: color-only luminance-variation approximation until depth is wired.
//! - SSR: passthrough copy until depth + normals are wired.
//!
//! Mirrors the TS `atmosphericEffects` from `effects-webgl` and the WGPU
//! `atmospheric_effects` from `effects-wgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{GodRaysEffect, ScreenSpaceFogEffect, SsaoEffect, SsrEffect};
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

// ---------------------------------------------------------------------------
// Recipe functions
// ---------------------------------------------------------------------------

/// Applies god-rays scattering to `source` and writes to `dest`.
pub fn apply_god_rays_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &GodRaysEffect,
) {
    let center_x = effect.center_x.unwrap_or(0.5);
    let center_y = effect.center_y.unwrap_or(0.5);
    let density = effect.density.unwrap_or(0.96);
    let decay = effect.decay.unwrap_or(0.93);
    let weight = effect.weight.unwrap_or(0.4);
    let exposure = effect.exposure.unwrap_or(0.6);
    let samples = effect.samples.unwrap_or(64).max(1);
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let key = format!("atmospheric.godRays.{samples}");
    let program = get_gl_effect_program(state, &key, &build_god_rays_fragment(samples));
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_lightPosition").as_ref(),
                center_x,
                center_y,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_density").as_ref(), density);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_decay").as_ref(), decay);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_weight").as_ref(), weight);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_exposure").as_ref(), exposure);
        },
    );
}

/// Applies screen-space fog to `source` and writes to `dest`.
///
/// When `depth_texture` is `Some`, the real depth-driven recipe runs
/// (`fog = 1 - exp(-density * remap(depth, near, far))`).  When `None`, a
/// screen-Y gradient proxy is used instead.
pub fn apply_screen_space_fog_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    depth_texture: Option<glow::Texture>,
    effect: &ScreenSpaceFogEffect,
) {
    let packed = effect.color.unwrap_or(0xc8d2dcff);
    let r = ((packed >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed >> 8) & 0xff) as f32 / 255.0;
    let density = effect.density.unwrap_or(1.0);
    let near = effect.near.unwrap_or(0.0);
    let far = effect.far.unwrap_or(1.0);
    let texture = source.texture;

    let program = get_gl_effect_program(
        state,
        "atmospheric.screenSpaceFog",
        SCREEN_SPACE_FOG_FRAGMENT_SRC,
    );
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    let inputs: Vec<glow::Texture> = match depth_texture {
        Some(depth) => vec![texture, depth],
        None => vec![texture],
    };
    let has_depth = if depth_texture.is_some() { 1.0 } else { 0.0 };
    draw_gl_effect_fullscreen_pass(state, program, &inputs, Some(dest), move |gl, p| unsafe {
        gl.uniform_3_f32(gl.get_uniform_location(p, "u_fogColor").as_ref(), r, g, b);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_density").as_ref(), density);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_near").as_ref(), near);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_far").as_ref(), far);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_hasDepth").as_ref(), has_depth);
    });
}

/// Applies SSAO (color-only luminance-variation approximation) to `source` and
/// writes to `dest`.
pub fn apply_ssao_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &SsaoEffect,
) {
    let radius = effect.radius.unwrap_or(1.0);
    let intensity = effect.intensity.unwrap_or(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "atmospheric.ssao", SSAO_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_radius").as_ref(), radius);
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
        },
    );
}

/// Applies SSR (passthrough copy until depth + normals are wired) to `source`
/// and writes to `dest`.
pub fn apply_ssr_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    _effect: &SsrEffect,
) {
    let texture = source.texture;
    let program = get_gl_effect_program(state, "atmospheric.ssr", SSR_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |_, _| {});
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`GodRaysEffect`].
pub const DEFAULT_GL_GOD_RAYS_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::GodRays(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_god_rays_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`ScreenSpaceFogEffect`].
pub const DEFAULT_GL_SCREEN_SPACE_FOG_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ScreenSpaceFog(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_screen_space_fog_effect_to_gl(
                state,
                ctx.source,
                ctx.dest,
                ctx.scene_depth_texture,
                effect,
            );
        }
    };

/// Default GL runner for [`SsaoEffect`].
pub const DEFAULT_GL_SSAO_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Ssao(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_ssao_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`SsrEffect`].
pub const DEFAULT_GL_SSR_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Ssr(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_ssr_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

// ---------------------------------------------------------------------------
// Fragment sources
// ---------------------------------------------------------------------------

// Bakes the marching sample count into the GLSL: a `for` bound must be a
// compile-time constant, so distinct sample counts produce distinct sources
// (and therefore distinct program-cache keys).
fn build_god_rays_fragment(samples: u32) -> String {
    format!("{GOD_RAYS_FRAGMENT_HEAD}{samples}.0{GOD_RAYS_FRAGMENT_TAIL}")
}

const GOD_RAYS_FRAGMENT_HEAD: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform vec2 u_lightPosition;
uniform float u_density;
uniform float u_decay;
uniform float u_weight;
uniform float u_exposure;
out vec4 o_color;
const float SAMPLES = ";

const GOD_RAYS_FRAGMENT_TAIL: &str = ";
void main() {
  vec2 delta = (v_texCoord - u_lightPosition) * (u_density / SAMPLES);
  vec2 coord = v_texCoord;
  vec4 base = texture(u_texture0, v_texCoord);
  vec3 accum = base.rgb;
  float illumination = 1.0;
  for (int i = 0; i < int(SAMPLES); i++) {
    coord -= delta;
    vec3 s = texture(u_texture0, coord).rgb;
    s *= illumination * u_weight;
    accum += s;
    illumination *= u_decay;
  }
  o_color = vec4(base.rgb + accum * u_exposure, base.a);
}";

const SCREEN_SPACE_FOG_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec3 u_fogColor;
uniform float u_density;
uniform float u_near;
uniform float u_far;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float fog;
  if (u_hasDepth > 0.5) {
    // Real depth path: window-space depth remapped over [near, far], exponential fog by density.
    float depth = texture(u_texture1, v_texCoord).r;
    float d = clamp((depth - u_near) / max(u_far - u_near, 1e-4), 0.0, 1.0);
    fog = clamp(1.0 - exp(-u_density * d), 0.0, 1.0);
  } else {
    // Sentinel path: no depth written (flat 2D scene) — screen-Y gradient as a depth proxy.
    fog = clamp((1.0 - v_texCoord.y) * u_density, 0.0, 1.0);
  }
  o_color = vec4(mix(c.rgb, u_fogColor, fog), c.a);
}";

const SSAO_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_intensity;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = (1.0 / u_resolution) * max(u_radius, 1.0);
  vec4 center = texture(u_texture0, v_texCoord);
  float lc = luma(center.rgb);
  float variation = 0.0;
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb));
  variation *= 0.25;
  float occlusion = clamp(variation * u_intensity, 0.0, 1.0);
  o_color = vec4(center.rgb * (1.0 - occlusion), center.a);
}";

const SSR_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}";

#[cfg(test)]
mod tests {
    use super::*;

    // build_god_rays_fragment

    #[test]
    fn build_god_rays_fragment_bakes_sample_count() {
        let frag = build_god_rays_fragment(48);
        assert!(frag.contains("const float SAMPLES = 48.0;"));
        assert!(frag.contains("for (int i = 0; i < int(SAMPLES)"));
        // Distinct sample counts produce distinct sources (distinct cache keys).
        assert_ne!(build_god_rays_fragment(64), build_god_rays_fragment(32));
    }

    #[test]
    fn build_god_rays_fragment_is_valid_es_300_header() {
        let frag = build_god_rays_fragment(64);
        assert!(frag.contains("#version 300 es"));
        assert!(frag.contains("u_lightPosition"));
        assert!(frag.contains("accum * u_exposure"));
    }

    // SCREEN_SPACE_FOG_FRAGMENT_SRC

    #[test]
    fn screen_space_fog_uses_depth_path_and_y_gradient_proxy() {
        assert!(SCREEN_SPACE_FOG_FRAGMENT_SRC.contains("u_hasDepth > 0.5"));
        assert!(SCREEN_SPACE_FOG_FRAGMENT_SRC.contains("1.0 - exp(-u_density * d)"));
        assert!(SCREEN_SPACE_FOG_FRAGMENT_SRC.contains("(1.0 - v_texCoord.y) * u_density"));
        assert!(SCREEN_SPACE_FOG_FRAGMENT_SRC.contains("u_fogColor"));
    }

    // SSAO_FRAGMENT_SRC

    #[test]
    fn ssao_fragment_declares_resolution_and_radius() {
        assert!(SSAO_FRAGMENT_SRC.contains("u_radius"));
        assert!(SSAO_FRAGMENT_SRC.contains("uniform vec2 u_resolution"));
        assert!(SSAO_FRAGMENT_SRC.contains("center.rgb * (1.0 - occlusion)"));
    }

    // SSR_FRAGMENT_SRC

    #[test]
    fn ssr_fragment_is_passthrough_copy() {
        assert!(SSR_FRAGMENT_SRC.contains("o_color = texture(u_texture0, v_texCoord)"));
    }
}
