//! GL HDR / tone-mapping effect recipes.
//!
//! - Bloom: bright-pass → separable gaussian blur of the bright branch →
//!   additive composite.  Multi-pass; acquires intermediate targets from the
//!   pool.  The blur is inlined here — the effect substrate is self-contained
//!   and does not route through `flighthq-filters-gl`.
//! - Exposure: single-pass `color * 2^stops`.
//! - Tone map: single-pass operator (ACES, Reinhard, filmic, AGX, Uncharted2).
//!
//! The substrate-agnostic blur radius comes from
//! [`compute_bloom_blur_radius`](flighthq_effects::compute_bloom_blur_radius) so
//! this backend derives the same parameters as the WGPU backend from one intent.
//!
//! Mirrors the TS `toneEffects` from `effects-webgl`.

use flighthq_effects::RenderEffect;
use flighthq_effects::compute_bloom_blur_radius;
use flighthq_effects::types::{BloomEffect, ExposureEffect, ToneMapEffect, ToneMapOperator};
use flighthq_filters_gl::apply_gaussian_blur_filter_to_gl;
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use flighthq_render_gl::render_target_pool::{
    GlRenderTargetPool, acquire_gl_render_target, get_gl_render_target, release_gl_render_target,
};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

// ---------------------------------------------------------------------------
// Recipe functions
// ---------------------------------------------------------------------------

/// Applies bloom (bright-pass → blur → additive composite) to `source` and
/// writes to `dest`.  Acquires intermediate targets from `pool`.
pub fn apply_bloom_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    pool: &mut GlRenderTargetPool,
    effect: &BloomEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.8);
    let intensity = effect.intensity.unwrap_or(1.0);
    let radius = compute_bloom_blur_radius(effect);
    let (w, h, format) = (source.width, source.height, source.format);

    let bright_id = acquire_gl_render_target(state, pool, w, h, format);
    let blurred_id = acquire_gl_render_target(state, pool, w, h, format);
    let temp_id = acquire_gl_render_target(state, pool, w, h, format);

    // Pooled targets live in `pool`, disjoint from `state` and the source/dest
    // targets owned by the pipeline; acquire only appends, so existing entries
    // are not moved while these pointers are held.
    let bright_ptr: *const GlRenderTarget =
        get_gl_render_target(pool, bright_id).expect("bright target");
    let blurred_ptr: *const GlRenderTarget =
        get_gl_render_target(pool, blurred_id).expect("blurred target");
    let temp_ptr: *const GlRenderTarget = get_gl_render_target(pool, temp_id).expect("temp target");
    // SAFETY: the three pooled targets are distinct entries acquired above and
    // are not freed or moved for the duration of the passes below.
    let (bright, blurred, temp) = unsafe { (&*bright_ptr, &*blurred_ptr, &*temp_ptr) };

    let bright_texture = source.texture;
    let program = get_gl_effect_program(state, "bloom.bright", BLOOM_BRIGHT_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[bright_texture],
        Some(bright),
        |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_threshold").as_ref(),
                threshold,
            );
        },
    );

    // Reuse the filter-tier Gaussian (true sigma-based `⌈3σ⌉` exp-weighted blur)
    // so bloom matches the TS path, which calls `applyGaussianBlurFilterToGl`.
    apply_gaussian_blur_filter_to_gl(state, bright, blurred, temp, radius, radius);

    let scene_texture = source.texture;
    let blurred_texture = blurred.texture;
    let program = get_gl_effect_program(state, "bloom.composite", BLOOM_COMPOSITE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[scene_texture, blurred_texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
        },
    );

    release_gl_render_target(pool, bright_id);
    release_gl_render_target(pool, blurred_id);
    release_gl_render_target(pool, temp_id);
}

/// Applies exposure scaling to `source` and writes to `dest`.
pub fn apply_exposure_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &ExposureEffect,
) {
    let multiplier = 2.0f32.powf(effect.exposure.unwrap_or(0.0));
    let texture = source.texture;
    let program = get_gl_effect_program(state, "exposure", EXPOSURE_FRAGMENT_SRC);
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_exposure").as_ref(),
            multiplier,
        );
    });
}

/// Applies tone mapping to `source` and writes to `dest`.
pub fn apply_tone_map_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &ToneMapEffect,
) {
    let operator = effect.operator.unwrap_or(ToneMapOperator::Aces);
    let exposure = effect.exposure.unwrap_or(1.0);
    let white = effect.white.unwrap_or(1.0);
    let texture = source.texture;
    let key = tone_map_program_key(operator);
    let program = get_gl_effect_program(state, key, &build_tone_map_fragment(operator));
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*(program as *const _) };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], Some(dest), |gl, p| unsafe {
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_exposure").as_ref(), exposure);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_white").as_ref(), white);
    });
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`BloomEffect`].
pub const DEFAULT_GL_BLOOM_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Bloom(effect) = effect {
            apply_bloom_effect_to_gl(
                reborrow_state(ctx),
                ctx.source,
                ctx.dest,
                reborrow_pool(ctx),
                effect,
            );
        }
    };

/// Default GL runner for [`ExposureEffect`].
pub const DEFAULT_GL_EXPOSURE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Exposure(effect) = effect {
            apply_exposure_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`ToneMapEffect`].
pub const DEFAULT_GL_TONE_MAP_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ToneMap(effect) = effect {
            apply_tone_map_effect_to_gl(reborrow_state(ctx), ctx.source, ctx.dest, effect);
        }
    };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Splices the operator body between the shared tone-map head (uniforms +
// `tonemap` fn signature) and tail (`main` that applies it). The CPU seam these
// recipes are tested against.
fn build_tone_map_fragment(operator: ToneMapOperator) -> String {
    let mut src = String::with_capacity(512);
    src.push_str(TONEMAP_FRAGMENT_HEAD);
    src.push_str(tone_map_operator_body(operator));
    src.push_str(TONEMAP_FRAGMENT_TAIL);
    src
}

// Reborrows the context's pool as a fresh mutable reference. See `reborrow_state`.
fn reborrow_pool<'a>(ctx: &'a GlRenderEffectContext) -> &'a mut GlRenderTargetPool {
    let ptr = ctx.pool as *const GlRenderTargetPool as *mut GlRenderTargetPool;
    // SAFETY: `ctx.pool` is the only live reference to the pool for the duration
    // of the runner call; the pipeline does not touch it concurrently.
    unsafe { &mut *ptr }
}

// Reborrows the context's render state as a fresh mutable reference. The
// pipeline hands the runner a shared `&GlRenderEffectContext` whose `state`
// field is itself a `&mut GlRenderState`; recipes need that mutability to
// compile/cache programs. The context is owned by the pipeline for the duration
// of the runner call, so the state alias is unique while the runner holds it.
fn reborrow_state<'a>(ctx: &'a GlRenderEffectContext) -> &'a mut GlRenderState {
    let ptr = ctx.state as *const GlRenderState as *mut GlRenderState;
    // SAFETY: `ctx.state` is the only live reference to the render state for the
    // duration of the runner call; the pipeline does not touch it concurrently.
    unsafe { &mut *ptr }
}

// Stable per-operator program-cache key so each operator compiles its own
// fragment once. Mirrors the TS `toneMap.${operator}` keys.
fn tone_map_program_key(operator: ToneMapOperator) -> &'static str {
    match operator {
        ToneMapOperator::Aces => "toneMap.aces",
        ToneMapOperator::Reinhard => "toneMap.reinhard",
        ToneMapOperator::Filmic => "toneMap.filmic",
        ToneMapOperator::Agx => "toneMap.agx",
        ToneMapOperator::Uncharted2 => "toneMap.uncharted2",
    }
}

// GLSL operator body returning the tone-mapped `vec3 x`. Spliced into the head/tail.
fn tone_map_operator_body(operator: ToneMapOperator) -> &'static str {
    match operator {
        ToneMapOperator::Aces => {
            "
  vec3 a = x * (2.51 * x + 0.03);
  vec3 b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;"
        }
        ToneMapOperator::Reinhard => {
            "
  return x / (1.0 + x / (u_white * u_white));"
        }
        ToneMapOperator::Filmic => {
            "
  vec3 X = max(vec3(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);"
        }
        ToneMapOperator::Uncharted2 => {
            "
  float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
  vec3 v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;"
        }
        ToneMapOperator::Agx => {
            "
  vec3 v = clamp((x - 0.004) / (1.0 + x), 0.0, 1.0);
  return pow(v, vec3(0.8));"
        }
    }
}

const BLOOM_BRIGHT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = step(u_threshold, l);
  o_color = vec4(c.rgb * k, c.a);
}";

const BLOOM_COMPOSITE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  vec4 bloom = texture(u_texture1, v_texCoord);
  o_color = vec4(scene.rgb + bloom.rgb * u_intensity, scene.a);
}";

const EXPOSURE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  o_color = vec4(c.rgb * u_exposure, c.a);
}";

const TONEMAP_FRAGMENT_HEAD: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
uniform float u_white;
out vec4 o_color;
vec3 tonemap(vec3 x) {";

const TONEMAP_FRAGMENT_TAIL: &str = "}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 mapped = tonemap(c.rgb * u_exposure);
  o_color = vec4(clamp(mapped, 0.0, 1.0), c.a);
}";

#[cfg(test)]
mod tests {
    use super::*;

    // CPU-deterministic seams: GLSL source assembly, operator splicing, and
    // program-cache keys. No GL context is created.

    #[test]
    fn bloom_composite_fragment_reads_two_textures() {
        assert!(BLOOM_COMPOSITE_FRAGMENT_SRC.contains("uniform sampler2D u_texture0"));
        assert!(BLOOM_COMPOSITE_FRAGMENT_SRC.contains("uniform sampler2D u_texture1"));
        assert!(BLOOM_COMPOSITE_FRAGMENT_SRC.contains("uniform float u_intensity"));
    }

    #[test]
    fn bloom_bright_fragment_declares_threshold_uniform() {
        assert!(BLOOM_BRIGHT_FRAGMENT_SRC.contains("uniform float u_threshold"));
        assert!(BLOOM_BRIGHT_FRAGMENT_SRC.contains("step(u_threshold, l)"));
    }

    #[test]
    fn build_tone_map_fragment_splices_operator_body() {
        let aces = build_tone_map_fragment(ToneMapOperator::Aces);
        assert!(aces.contains("2.51 * x"));
        assert!(aces.contains("vec3 tonemap(vec3 x)"));
        assert!(aces.contains("void main()"));
        let reinhard = build_tone_map_fragment(ToneMapOperator::Reinhard);
        assert!(reinhard.contains("u_white * u_white"));
        let agx = build_tone_map_fragment(ToneMapOperator::Agx);
        assert!(agx.contains("pow(v, vec3(0.8))"));
    }

    #[test]
    fn exposure_fragment_declares_exposure_uniform() {
        assert!(EXPOSURE_FRAGMENT_SRC.contains("uniform float u_exposure"));
        assert!(EXPOSURE_FRAGMENT_SRC.contains("c.rgb * u_exposure"));
    }

    #[test]
    fn tone_map_program_key_is_distinct_per_operator() {
        assert_eq!(tone_map_program_key(ToneMapOperator::Aces), "toneMap.aces");
        assert_eq!(
            tone_map_program_key(ToneMapOperator::Uncharted2),
            "toneMap.uncharted2"
        );
        assert_ne!(
            tone_map_program_key(ToneMapOperator::Filmic),
            tone_map_program_key(ToneMapOperator::Agx)
        );
    }
}
