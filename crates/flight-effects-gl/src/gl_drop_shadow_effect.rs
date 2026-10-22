// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance,
//! then composite the source over the shadow. Full-frame realization: acquires the recipe's three
//! scratch targets from the effect pool, runs the inlined multi-pass recipe, then releases them.
//!
//! Compositing order depends on `source_mode`: `Draw` composites shadow → source, `Hide` composites
//! shadow only, and `Knockout` composites shadow then erases the un-offset source silhouette.

use flight_render::RenderTargetClear;
use flight_effects::{DropShadowEffect, Effect, EffectSourceMode};
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, clear_gl_render_target, release_gl_texture_render_target,
};

use crate::contract::{
    GlEffectBoxBlurOptions, GlEffectContext, apply_gl_effect_blit_offset_pass,
    apply_gl_effect_blit_pass, apply_gl_effect_box_blur, apply_gl_effect_erase_pass,
    apply_gl_effect_tint_pass, register_gl_effect,
};
use crate::gl_effect_support::acquire_gl_effect_target;

pub fn apply_drop_shadow_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &DropShadowEffect,
) -> Result<(), String> {
    let s0 = acquire_gl_effect_target(state, pool, source)?;
    let s1 = acquire_gl_effect_target(state, pool, source)?;
    let s2 = acquire_gl_effect_target(state, pool, source)?;

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    // Packed RGBA; the tint pass folds this color's own alpha into the effect-level one.
    let color = effect.color.unwrap_or(0x000000ff);
    let alpha = effect.alpha.unwrap_or(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = effect.quality.unwrap_or(1.0).round().max(1.0);
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);

    let tint_strength = strength.min(1.0);
    let shadow_passes = strength.floor().max(1.0) as u32;

    let (mask, blurred, blur_temp) = (&s0, &s1, &s2);
    let result = (|| -> Result<(), String> {
        apply_gl_effect_tint_pass(state, source, mask, color, alpha, tint_strength)?;
        apply_gl_effect_box_blur(
            state,
            mask,
            blurred,
            blur_temp,
            &GlEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: None,
            },
        )?;

        clear_gl_render_target(
            dest,
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        for _ in 0..shadow_passes {
            apply_gl_effect_blit_offset_pass(state, blurred, dest, dx, dy)?;
        }

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

pub fn gl_drop_shadow_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<DropShadowEffect>() else {
        return Ok(());
    };
    return apply_drop_shadow_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_drop_shadow_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "DropShadowEffect",
        gl_drop_shadow_effect_runner,
        None,
    );
}
