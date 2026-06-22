//! GL anti-aliasing effect recipes.
//!
//! FXAA: luminance edge detection + directional blend (single-pass reference).
//! SMAA: single-pass edge-aware blur approximation.
//! TAA: passthrough copy placeholder (no history buffer available).
//!
//! Mirrors the TS `antialiasingEffects` from `effects-webgl`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{FxaaEffect, SmaaEffect, TaaEffect};
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

/// Applies FXAA to `source` and writes the result to `dest`.
pub fn apply_fxaa_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &FxaaEffect,
) {
    let edge_threshold = effect.edge_threshold.unwrap_or(0.0312);
    let width = source.width as f32;
    let height = source.height as f32;
    let program = get_gl_effect_program(state, "antialiasing.fxaa", FXAA_FRAGMENT_SRC) as *const _;
    // SAFETY: the program is boxed in the per-state cache and stays live and
    // pinned while `state` is borrowed, so the pointer is valid for this draw.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_edgeThreshold").as_ref(),
                edge_threshold,
            );
        },
    );
}

/// Applies SMAA (single-pass approximation) to `source` and writes to `dest`.
pub fn apply_smaa_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &SmaaEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.1);
    let width = source.width as f32;
    let height = source.height as f32;
    let program = get_gl_effect_program(state, "antialiasing.smaa", SMAA_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_fxaa_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_threshold").as_ref(),
                threshold,
            );
        },
    );
}

/// Applies TAA (passthrough) to `source` and writes to `dest`.
pub fn apply_taa_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    _effect: &TaaEffect,
) {
    let program = get_gl_effect_program(state, "antialiasing.taa", TAA_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_fxaa_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(state, program, &[source.texture], Some(dest), |_, _| {});
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`FxaaEffect`].
pub const DEFAULT_GL_FXAA_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Fxaa(effect) = effect {
            // SAFETY: the pipeline guarantees `state` is disjoint from `source`/`dest`
            // for the duration of the call; reborrow the `&mut` field through the
            // shared context.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_fxaa_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`SmaaEffect`].
pub const DEFAULT_GL_SMAA_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Smaa(effect) = effect {
            // SAFETY: see `DEFAULT_GL_FXAA_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_smaa_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`TaaEffect`].
pub const DEFAULT_GL_TAA_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Taa(effect) = effect {
            // SAFETY: see `DEFAULT_GL_FXAA_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_taa_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

// FXAA: luminance edge detection + directional blend along the detected edge.
const FXAA_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_edgeThreshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 rgbM = texture(u_texture0, v_texCoord).rgb;
  vec3 rgbNW = texture(u_texture0, v_texCoord + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture(u_texture0, v_texCoord + vec2(1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture(u_texture0, v_texCoord + vec2(-1.0, 1.0) * texel).rgb;
  vec3 rgbSE = texture(u_texture0, v_texCoord + vec2(1.0, 1.0) * texel).rgb;
  float lumaM = luma(rgbM);
  float lumaNW = luma(rgbNW);
  float lumaNE = luma(rgbNE);
  float lumaSW = luma(rgbSW);
  float lumaSE = luma(rgbSE);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  float range = lumaMax - lumaMin;
  if (range < max(u_edgeThreshold, lumaMax * 0.125)) {
    o_color = vec4(rgbM, texture(u_texture0, v_texCoord).a);
    return;
  }
  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * texel;
  vec3 rgbA = 0.5 * (
    texture(u_texture0, v_texCoord + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture(u_texture0, v_texCoord + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture(u_texture0, v_texCoord + dir * -0.5).rgb +
    texture(u_texture0, v_texCoord + dir * 0.5).rgb);
  float lumaB = luma(rgbB);
  vec3 result = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}";

// SMAA: a single-pass edge-aware blur approximation gated by `u_threshold`.
const SMAA_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_threshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 center = texture(u_texture0, v_texCoord);
  float lumaC = luma(center.rgb);
  float lumaL = luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb);
  float lumaR = luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb);
  float lumaT = luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb);
  float lumaB = luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb);
  float edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < u_threshold) {
    o_color = center;
    return;
  }
  vec3 blurred = (
    texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb +
    center.rgb) / 5.0;
  o_color = vec4(blurred, center.a);
}";

// TAA: passthrough copy (no history buffer / motion vectors available).
const TAA_FRAGMENT_SRC: &str = "#version 300 es
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

    #[test]
    fn fxaa_fragment_declares_uniforms_and_entry() {
        assert!(FXAA_FRAGMENT_SRC.contains("uniform float u_edgeThreshold"));
        assert!(FXAA_FRAGMENT_SRC.contains("uniform sampler2D u_texture0"));
        assert!(FXAA_FRAGMENT_SRC.contains("void main()"));
        assert!(FXAA_FRAGMENT_SRC.contains("#version 300 es"));
    }

    #[test]
    fn smaa_fragment_declares_threshold() {
        assert!(SMAA_FRAGMENT_SRC.contains("uniform float u_threshold"));
        assert!(SMAA_FRAGMENT_SRC.contains("void main()"));
        assert!(SMAA_FRAGMENT_SRC.contains("uniform vec2 u_resolution"));
    }

    #[test]
    fn taa_fragment_is_passthrough() {
        assert!(TAA_FRAGMENT_SRC.contains("o_color = texture(u_texture0, v_texCoord)"));
        assert!(!TAA_FRAGMENT_SRC.contains("u_resolution"));
    }
}
