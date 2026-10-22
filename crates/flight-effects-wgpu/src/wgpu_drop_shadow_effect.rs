// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Drop shadow (TS `wgpuDropShadowEffect.ts`): tint the scene silhouette, blur it, offset it by
//! angle/distance, then apply sourceMode compositing. Acquires the recipe's three scratch targets
//! from the effect pool, runs tint → box blur → offset → composite, then releases them.

use flight_effects::{DropShadowEffect, Effect, EffectSourceMode};
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuRenderTargetPool, WgpuTextureRenderTarget,
    WgpuTextureRenderTargetDescriptor, acquire_wgpu_texture_render_target,
    release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_effect_blit_shader::{
    apply_wgpu_effect_blit_offset_pass, apply_wgpu_effect_blit_pass, apply_wgpu_effect_erase_pass,
};
use crate::wgpu_effect_box_blur::apply_wgpu_effect_box_blur;
use crate::wgpu_effect_pass::clear_wgpu_effect_target;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_tint_shader::apply_wgpu_effect_tint_pass;

/// Applies a `DropShadowEffect` from `source` into `dest`, borrowing three scratch targets from
/// `pool` (TS `applyDropShadowEffectToWgpu`).
pub fn apply_drop_shadow_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &DropShadowEffect,
) {
    let descriptor = WgpuTextureRenderTargetDescriptor {
        color_space: None,
        format: Some(source.format),
        height: source.height as f32,
        sample_count: None,
        width: source.width as f32,
    };
    let mask = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let blurred = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let blur_temp = acquire_wgpu_texture_render_target(state, pool, &descriptor);

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    // Packed RGBA, matching BitmapDropShadowOptions.color offscreen. The tint pass folds this
    // color's own alpha into the effect-level one, so nothing splits the value here.
    let color = effect.color.unwrap_or(0x000000ff);
    let alpha = effect.alpha.unwrap_or(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = 1.0_f32.max((effect.quality.unwrap_or(1.0) + 0.5).floor());
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);

    let tint_strength = 1.0_f32.min(strength);
    let shadow_passes = 1.0_f32.max(strength.floor()) as u32;

    {
        let mask = mask.read().unwrap();
        let blurred = blurred.read().unwrap();
        let blur_temp = blur_temp.read().unwrap();
        apply_wgpu_effect_tint_pass(state, source, &mask, color, alpha, tint_strength);
        apply_wgpu_effect_box_blur(
            state,
            &mask,
            &blurred,
            &blur_temp,
            &WgpuEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: None,
            },
        );

        clear_wgpu_effect_target(state, dest);
        for _ in 0..shadow_passes {
            apply_wgpu_effect_blit_offset_pass(state, &blurred, dest, dx, dy);
        }

        if source_mode == EffectSourceMode::Knockout {
            apply_wgpu_effect_erase_pass(state, source, dest);
        } else if source_mode == EffectSourceMode::Draw {
            apply_wgpu_effect_blit_pass(state, source, dest);
        }
    }

    release_wgpu_texture_render_target(pool, mask);
    release_wgpu_texture_render_target(pool, blurred);
    release_wgpu_texture_render_target(pool, blur_temp);
}

/// Registers the default runner under `DropShadowEffect` (TS `registerWgpuDropShadowEffect`).
pub fn register_wgpu_drop_shadow_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "DropShadowEffect", wgpu_drop_shadow_effect_runner, None);
}

/// The default `DropShadowEffect` runner (TS `wgpuDropShadowEffectRunner`).
pub fn wgpu_drop_shadow_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<DropShadowEffect>(effect, "wgpuDropShadowEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_drop_shadow_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
