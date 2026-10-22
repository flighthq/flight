// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, own a transient ramp texture and return Result diagnostics
//! Gradient-bevel composite effect: blur the silhouette, encode the lit/shaded gradient along the
//! angle/distance offset, map it through a 256-entry color ramp, clip to the source alpha, then
//! composite. Full-frame realization: acquires the recipe's three scratch targets from the effect
//! pool, runs the inlined multi-pass recipe, then releases them.

use flight_effects::{Effect, EffectSourceMode, GradientBevelEffect};
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, RenderTargetClear,
    clear_gl_render_target, draw_gl_fullscreen_pass, release_gl_texture_render_target,
};
use glow::{HasContext, NativeTexture};

use crate::contract::{
    GlEffectBoxBlurOptions, GlEffectContext, apply_gl_effect_blit_pass, apply_gl_effect_box_blur,
    apply_gl_effect_erase_pass, apply_gl_effect_tint_pass, create_gl_effect_gradient_ramp_texture,
    register_gl_effect,
};
use crate::gl_effect_support::{
    acquire_gl_effect_target, get_gl_effect_shader, set_blend_func, set_uniform_1i, set_uniform_2f,
    uniform_location,
};

const BEVEL_ENCODE_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_offset;
out vec4 fragColor;
void main() {
  float high = texture(u_texture, v_texCoord - u_offset).a;
  float low = texture(u_texture, v_texCoord + u_offset).a;
  float bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  fragColor = vec4(bevelVal, 0.0, 0.0, 1.0);
}"#;

const BEVEL_APPLY_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
uniform sampler2D u_source;
out vec4 fragColor;
void main() {
  float bevelVal = texture(u_texture, v_texCoord).r;
  vec4 color = texture(u_ramp, vec2(bevelVal, 0.5));
  float srcAlpha = texture(u_source, v_texCoord).a;
  fragColor = color * srcAlpha;
}"#;

fn apply_bevel_apply_pass(
    state: &mut GlRenderState,
    encoded: &GlTextureRenderTarget,
    ramp: NativeTexture,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "gradientBevel.apply", BEVEL_APPLY_FRAGMENT_SRC)?;
    let loc_ramp = uniform_location(&state.gl, &program, "u_ramp");
    let loc_source = uniform_location(&state.gl, &program, "u_source");
    let source_texture = source.texture;
    return draw_gl_fullscreen_pass(state, &program, &[encoded.texture], Some(dest), |gl, _p| {
        // SAFETY: units 1 and 2 are bound for this draw only; the active unit is restored to 0.
        unsafe {
            gl.active_texture(glow::TEXTURE1);
            gl.bind_texture(glow::TEXTURE_2D, Some(ramp));
        }
        set_uniform_1i(gl, loc_ramp.as_ref(), 1);
        // SAFETY: see above.
        unsafe {
            gl.active_texture(glow::TEXTURE2);
            gl.bind_texture(glow::TEXTURE_2D, Some(source_texture));
        }
        set_uniform_1i(gl, loc_source.as_ref(), 2);
        // SAFETY: restores the default active unit.
        unsafe { gl.active_texture(glow::TEXTURE0) };
        set_blend_func(gl, glow::ONE, glow::ZERO);
    });
}

fn apply_bevel_encode_pass(
    state: &mut GlRenderState,
    blurred: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    dx: f32,
    dy: f32,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "gradientBevel.encode", BEVEL_ENCODE_FRAGMENT_SRC)?;
    let loc_offset = uniform_location(&state.gl, &program, "u_offset");
    return draw_gl_fullscreen_pass(state, &program, &[blurred.texture], Some(dest), |gl, _p| {
        set_uniform_2f(gl, loc_offset.as_ref(), dx, dy);
        set_blend_func(gl, glow::ONE, glow::ZERO);
    });
}

pub fn apply_gradient_bevel_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &GradientBevelEffect,
) -> Result<(), String> {
    let s0 = acquire_gl_effect_target(state, pool, source)?;
    let s1 = acquire_gl_effect_target(state, pool, source)?;
    let s2 = acquire_gl_effect_target(state, pool, source)?;

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
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
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: None,
            },
        )?;

        let dx = angle.cos() * distance;
        let dy = angle.sin() * distance;
        apply_bevel_encode_pass(
            state,
            &s1,
            &s0,
            dx / s1.axes.width as f32,
            -dy / s1.axes.height as f32,
        )?;

        let ramp = create_gl_effect_gradient_ramp_texture(
            &state.gl,
            &effect.colors,
            &effect.alphas,
            &effect.ratios,
        )?;
        let applied = apply_bevel_apply_pass(state, &s0, ramp, source, &s1);
        // SAFETY: the ramp was created on this context above and is owned by this call.
        unsafe { state.gl.delete_texture(ramp) };
        applied?;

        clear_gl_render_target(
            dest,
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        if source_mode == EffectSourceMode::Draw {
            apply_gl_effect_blit_pass(state, source, dest)?;
        }
        apply_gl_effect_blit_pass(state, &s1, dest)?;
        if source_mode == EffectSourceMode::Knockout {
            apply_gl_effect_erase_pass(state, source, dest)?;
        }
        return Ok(());
    })();

    release_gl_texture_render_target(pool, s0);
    release_gl_texture_render_target(pool, s1);
    release_gl_texture_render_target(pool, s2);
    return result;
}

pub fn gl_gradient_bevel_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<GradientBevelEffect>() else {
        return Ok(());
    };
    return apply_gradient_bevel_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_gradient_bevel_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "GradientBevelEffect",
        gl_gradient_bevel_effect_runner,
        None,
    );
}
