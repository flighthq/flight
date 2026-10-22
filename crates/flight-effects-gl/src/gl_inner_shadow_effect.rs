// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance,
//! clip to the source alpha, then composite over the source. Full-frame realization: acquires the
//! recipe's three scratch targets from the effect pool, runs the inlined multi-pass recipe, then
//! releases them.
//!
//! All passes use premultiplied blending and never implicitly clear their destination, so a
//! reused scratch target is cleared before each reuse.

use flight_color::unpack_color_rgba;
use flight_effects::{Effect, InnerEffectSourceMode, InnerShadowEffect};
use flight_render::RenderTargetClear;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, clear_gl_render_target,
    draw_gl_fullscreen_pass, release_gl_texture_render_target,
};

use crate::contract::{
    GlEffectBoxBlurOptions, GlEffectContext, apply_gl_effect_blit_offset_pass,
    apply_gl_effect_blit_pass, apply_gl_effect_box_blur, apply_gl_effect_invert_tint_pass,
    register_gl_effect,
};
use crate::gl_effect_support::{acquire_gl_effect_target, get_gl_effect_shader, set_blend_func};

// Same clip shader as innerGlow — clips unit-0 glow to unit-1 source alpha.
const INNER_CLIP_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
out vec4 fragColor;
void main() {
  vec4 shadow = texture(u_texture0, v_texCoord);
  float srcAlpha = texture(u_texture1, v_texCoord).a;
  fragColor = shadow * srcAlpha;
}"#;

fn apply_gl_inner_clip_pass(
    state: &mut GlRenderState,
    shadow: &GlTextureRenderTarget,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "innerShadow.clip", INNER_CLIP_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(
        state,
        &program,
        &[shadow.texture, source.texture],
        Some(dest),
        |gl, _p| {
            set_blend_func(gl, glow::ONE, glow::ZERO);
        },
    );
}

/// Algorithm: (1) invert-tint the source alpha with the shadow color; (2) blur; (3) offset by
/// angle/distance; (4) clip to the source alpha; (5) composite source (unless `Hide`) + shadow.
pub fn apply_inner_shadow_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &InnerShadowEffect,
) -> Result<(), String> {
    let s0 = acquire_gl_effect_target(state, pool, source)?;
    let s1 = acquire_gl_effect_target(state, pool, source)?;
    let s2 = acquire_gl_effect_target(state, pool, source)?;

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    let color = effect.color.unwrap_or(0x000000ff);
    let alpha = effect.alpha.unwrap_or(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = effect.quality.unwrap_or(1.0).round().max(1.0);
    let source_mode = effect.source_mode.unwrap_or(InnerEffectSourceMode::Draw);

    let result = (|| -> Result<(), String> {
        // Pass 1: invert source alpha and tint with shadow color → s0
        apply_gl_effect_invert_tint_pass(state, source, &s0, color, alpha, strength)?;
        // Pass 2: blur → s1 (s2 is ping-pong temp)
        apply_gl_effect_box_blur(
            state,
            &s0,
            &s1,
            &s2,
            &GlEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: Some(get_invert_tint_edge_color(color, alpha, strength)),
            },
        )?;
        // Pass 3: shift the blurred shadow by the offset → s0 (cleared first).
        clear_gl_render_target(&s0, &transparent_clear());
        apply_gl_effect_blit_offset_pass(state, &s1, &s0, dx, dy)?;
        // Pass 4: clip offset shadow (s0) to source alpha → s1 (cleared first).
        clear_gl_render_target(&s1, &transparent_clear());
        apply_gl_inner_clip_pass(state, &s0, source, &s1)?;
        // Final composite: source first, unless hidden, then clipped shadow on top.
        clear_gl_render_target(dest, &transparent_clear());
        if source_mode == InnerEffectSourceMode::Draw {
            apply_gl_effect_blit_pass(state, source, dest)?;
        }
        return apply_gl_effect_blit_pass(state, &s1, dest);
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

pub fn gl_inner_shadow_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<InnerShadowEffect>() else {
        return Ok(());
    };
    return apply_inner_shadow_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_inner_shadow_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "InnerShadowEffect",
        gl_inner_shadow_effect_runner,
        None,
    );
}

fn transparent_clear() -> RenderTargetClear {
    return RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: None,
        stencil: None,
    };
}
