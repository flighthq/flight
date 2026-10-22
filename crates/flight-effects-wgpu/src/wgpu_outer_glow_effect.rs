// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Outer glow (TS `wgpuOuterGlowEffect.ts`): tint the scene silhouette, blur it centered (no
//! offset), then apply sourceMode compositing. Acquires three scratch targets from the effect pool,
//! runs tint → box blur → composite, then releases them.

use flight_effects::{Effect, EffectSourceMode, OuterGlowEffect};
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuRenderTargetPool, WgpuTextureRenderTarget,
    WgpuTextureRenderTargetDescriptor, acquire_wgpu_texture_render_target,
    release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_effect_blit_shader::{apply_wgpu_effect_blit_pass, apply_wgpu_effect_erase_pass};
use crate::wgpu_effect_box_blur::apply_wgpu_effect_box_blur;
use crate::wgpu_effect_pass::clear_wgpu_effect_target;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_tint_shader::apply_wgpu_effect_tint_pass;

/// Applies an `OuterGlowEffect` from `source` into `dest`, borrowing three scratch targets from
/// `pool` (TS `applyOuterGlowEffectToWgpu`).
pub fn apply_outer_glow_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &OuterGlowEffect,
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

    let color = effect.color.unwrap_or(0xff0000ff);
    let alpha = effect.alpha.unwrap_or(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = 1.0_f32.max((effect.quality.unwrap_or(1.0) + 0.5).floor());
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);

    let tint_strength = 1.0_f32.min(strength);
    let glow_passes = 1.0_f32.max(strength.floor()) as u32;

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
                blur_x: Some(effect.blur_x.unwrap_or(6.0)),
                blur_y: Some(effect.blur_y.unwrap_or(6.0)),
                passes: Some(quality),
                edge_color: None,
            },
        );

        clear_wgpu_effect_target(state, dest);
        for _ in 0..glow_passes {
            apply_wgpu_effect_blit_pass(state, &blurred, dest);
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

/// Registers the default runner under `OuterGlowEffect` (TS `registerWgpuOuterGlowEffect`).
pub fn register_wgpu_outer_glow_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "OuterGlowEffect", wgpu_outer_glow_effect_runner, None);
}

/// The default `OuterGlowEffect` runner (TS `wgpuOuterGlowEffectRunner`).
pub fn wgpu_outer_glow_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<OuterGlowEffect>(effect, "wgpuOuterGlowEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_outer_glow_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
