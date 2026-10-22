// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source
//! alpha, then composite over the source. Full-frame realization: acquires the recipe's three
//! scratch targets from the effect pool, runs the inlined multi-pass recipe, then releases them.
//!
//! All passes use premultiplied blending and never implicitly clear their destination, so a
//! reused scratch target is cleared before each reuse.

use flight_render::RenderTargetClear;
use flight_color::unpack_color_rgba;
use flight_effects::{Effect, InnerEffectSourceMode, InnerGlowEffect};
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, clear_gl_render_target, draw_gl_fullscreen_pass, release_gl_texture_render_target,
};

use crate::contract::{
    GlEffectBoxBlurOptions, GlEffectContext, apply_gl_effect_blit_pass, apply_gl_effect_box_blur,
    apply_gl_effect_invert_tint_pass, register_gl_effect,
};
use crate::gl_effect_support::{acquire_gl_effect_target, get_gl_effect_shader, set_blend_func};

// Clips unit-0 (blurred inverted-alpha mask) to the source alpha from unit-1.
// The blurred inverted alpha is highest near interior edges; clipping to
// source alpha removes any glow that spilled outside the shape boundary.
const INNER_CLIP_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
out vec4 fragColor;
void main() {
  vec4 glow = texture(u_texture0, v_texCoord);
  float srcAlpha = texture(u_texture1, v_texCoord).a;
  fragColor = glow * srcAlpha;
}"#;

fn apply_gl_inner_clip_pass(
    state: &mut GlRenderState,
    glow: &GlTextureRenderTarget,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "innerGlow.clip", INNER_CLIP_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(
        state,
        &program,
        &[glow.texture, source.texture],
        Some(dest),
        |gl, _p| {
            set_blend_func(gl, glow::ONE, glow::ZERO);
        },
    );
}

/// Algorithm: (1) invert-tint the source alpha with the glow color; (2) blur toward the interior;
/// (3) clip the blurred glow to the source alpha; (4) composite source (unless `Hide`) + glow.
pub fn apply_inner_glow_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &InnerGlowEffect,
) -> Result<(), String> {
    let s0 = acquire_gl_effect_target(state, pool, source)?;
    let s1 = acquire_gl_effect_target(state, pool, source)?;
    let s2 = acquire_gl_effect_target(state, pool, source)?;

    let color = effect.color.unwrap_or(0xff0000ff);
    let alpha = effect.alpha.unwrap_or(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = effect.quality.unwrap_or(1.0).round().max(1.0);
    let source_mode = effect.source_mode.unwrap_or(InnerEffectSourceMode::Draw);

    let result = (|| -> Result<(), String> {
        // Pass 1: invert source alpha and tint with glow color → s0
        apply_gl_effect_invert_tint_pass(state, source, &s0, color, alpha, strength)?;
        // Pass 2: blur → s1 (s2 is ping-pong temp)
        apply_gl_effect_box_blur(
            state,
            &s0,
            &s1,
            &s2,
            &GlEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(6.0)),
                blur_y: Some(effect.blur_y.unwrap_or(6.0)),
                passes: Some(quality),
                edge_color: Some(get_invert_tint_edge_color(color, alpha, strength)),
            },
        )?;
        // Pass 3: clip blurred glow (s1) to source alpha, output to s0; clear s0's pass-1 content.
        clear_gl_render_target(&s0, &transparent_clear());
        apply_gl_inner_clip_pass(state, &s1, source, &s0)?;
        // Final composite: source first, unless hidden, then clipped glow on top.
        clear_gl_render_target(dest, &transparent_clear());
        if source_mode == InnerEffectSourceMode::Draw {
            apply_gl_effect_blit_pass(state, source, dest)?;
        }
        return apply_gl_effect_blit_pass(state, &s0, dest);
    })();

    release_gl_texture_render_target(pool, s0);
    release_gl_texture_render_target(pool, s1);
    release_gl_texture_render_target(pool, s2);
    return result;
}

/// The color is packed RGBA, so its own alpha multiplies the effect-level one before the premultiply.
fn get_invert_tint_edge_color(color: u32, alpha: f32, strength: f32) -> [f32; 4] {
    let mut edge = [0.0_f32; 4];
    unpack_color_rgba(&mut edge, color);
    let edge_alpha = (alpha * edge[3] * strength).min(1.0);
    return [
        edge[0] * edge_alpha,
        edge[1] * edge_alpha,
        edge[2] * edge_alpha,
        edge_alpha,
    ];
}

pub fn gl_inner_glow_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<InnerGlowEffect>() else {
        return Ok(());
    };
    return apply_inner_glow_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_inner_glow_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "InnerGlowEffect", gl_inner_glow_effect_runner, None);
}

fn transparent_clear() -> RenderTargetClear {
    return RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: None,
        stencil: None,
    };
}
