// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, own a transient ramp texture and return Result diagnostics
//! Gradient-glow composite effect: blur the silhouette, map the blurred coverage through a
//! 256-entry color ramp, then composite with the source. Full-frame realization: acquires the
//! recipe's three scratch targets from the effect pool, runs the inlined multi-pass recipe, then
//! releases them.

use flight_effects::{Effect, EffectSourceMode, GradientGlowEffect};
use flight_render::RenderTargetClear;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, clear_gl_render_target,
    draw_gl_fullscreen_pass, release_gl_texture_render_target,
};
use glow::{HasContext, NativeTexture};

use crate::contract::{
    GlEffectBoxBlurOptions, GlEffectContext, apply_gl_effect_blit_pass, apply_gl_effect_box_blur,
    apply_gl_effect_erase_pass, apply_gl_effect_tint_pass, create_gl_effect_gradient_ramp_texture,
    register_gl_effect,
};
use crate::gl_effect_support::{
    acquire_gl_effect_target, get_gl_effect_shader, set_blend_func, set_uniform_1i,
    uniform_location,
};

const GRADIENT_LOOKUP_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
out vec4 fragColor;
void main() {
  float alpha = texture(u_texture, v_texCoord).a;
  fragColor = texture(u_ramp, vec2(alpha, 0.5));
}"#;

pub fn apply_gradient_glow_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &GradientGlowEffect,
) -> Result<(), String> {
    let s0 = acquire_gl_effect_target(state, pool, source)?;
    let s1 = acquire_gl_effect_target(state, pool, source)?;
    let s2 = acquire_gl_effect_target(state, pool, source)?;

    let quality = effect.quality.unwrap_or(1.0).round().max(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);

    let result = (|| -> Result<(), String> {
        apply_gl_effect_tint_pass(state, source, &s0, 0xffffffff, 1.0, strength.min(1.0))?;
        apply_gl_effect_box_blur(
            state,
            &s0,
            &s1,
            &s2,
            &GlEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(6.0)),
                blur_y: Some(effect.blur_y.unwrap_or(6.0)),
                passes: Some(quality),
                edge_color: None,
            },
        )?;

        let ramp = create_gl_effect_gradient_ramp_texture(
            &state.gl,
            &effect.colors,
            &effect.alphas,
            &effect.ratios,
        )?;
        let looked_up = apply_gradient_lookup_pass(state, &s1, ramp, &s0);
        // SAFETY: the ramp was created on this context above and is owned by this call.
        unsafe { state.gl.delete_texture(ramp) };
        looked_up?;

        clear_gl_render_target(
            dest,
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        apply_gl_effect_blit_pass(state, &s0, dest)?;
        match source_mode {
            EffectSourceMode::Knockout => apply_gl_effect_erase_pass(state, source, dest)?,
            EffectSourceMode::Draw => apply_gl_effect_blit_pass(state, source, dest)?,
            EffectSourceMode::Hide => {}
        }
        return Ok(());
    })();

    release_gl_texture_render_target(pool, s0);
    release_gl_texture_render_target(pool, s1);
    release_gl_texture_render_target(pool, s2);
    return result;
}

fn apply_gradient_lookup_pass(
    state: &mut GlRenderState,
    blurred: &GlTextureRenderTarget,
    ramp: NativeTexture,
    dest: &GlTextureRenderTarget,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "gradientGlow.lookup", GRADIENT_LOOKUP_FRAGMENT_SRC)?;
    let loc_ramp = uniform_location(&state.gl, &program, "u_ramp");
    return draw_gl_fullscreen_pass(state, &program, &[blurred.texture], Some(dest), |gl, _p| {
        // SAFETY: unit 1 is bound for this draw only; the active unit is restored to 0.
        unsafe {
            gl.active_texture(glow::TEXTURE1);
            gl.bind_texture(glow::TEXTURE_2D, Some(ramp));
        }
        set_uniform_1i(gl, loc_ramp.as_ref(), 1);
        // SAFETY: restores the default active unit.
        unsafe { gl.active_texture(glow::TEXTURE0) };
        set_blend_func(gl, glow::ONE, glow::ZERO);
    });
}

pub fn gl_gradient_glow_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<GradientGlowEffect>() else {
        return Ok(());
    };
    return apply_gradient_glow_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_gradient_glow_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "GradientGlowEffect",
        gl_gradient_glow_effect_runner,
        None,
    );
}
