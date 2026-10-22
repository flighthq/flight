// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Inner glow (TS `wgpuInnerGlowEffect.ts`): tint the inverted silhouette, blur inward, clip to the
//! source alpha, then apply draw/hide source compositing. Acquires three scratch targets from the
//! effect pool, runs invert-tint → box blur → inner clip → composite, then releases them.

use flight_color::unpack_color_rgba;
use flight_effects::{Effect, InnerEffectSourceMode, InnerGlowEffect};
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuRenderTargetPool, WgpuTextureRenderTarget,
    WgpuTextureRenderTargetDescriptor, acquire_wgpu_texture_render_target,
    release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_effect_blit_shader::apply_wgpu_effect_blit_pass;
use crate::wgpu_effect_box_blur::apply_wgpu_effect_box_blur;
use crate::wgpu_effect_pass::clear_wgpu_effect_target;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_tint_shader::{
    apply_wgpu_effect_inner_clip_pass, apply_wgpu_effect_invert_tint_pass,
};

/// Applies an `InnerGlowEffect` from `source` into `dest`, borrowing three scratch targets from
/// `pool` (TS `applyInnerGlowEffectToWgpu`).
pub fn apply_inner_glow_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &InnerGlowEffect,
) {
    let descriptor = WgpuTextureRenderTargetDescriptor {
        color_space: None,
        format: Some(source.format),
        height: source.height as f32,
        sample_count: None,
        width: source.width as f32,
    };
    let s0 = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let s1 = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let s2 = acquire_wgpu_texture_render_target(state, pool, &descriptor);

    let color = effect.color.unwrap_or(0xff0000ff);
    let alpha = effect.alpha.unwrap_or(1.0);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = 1.0_f32.max((effect.quality.unwrap_or(1.0) + 0.5).floor());
    let source_mode = effect.source_mode.unwrap_or(InnerEffectSourceMode::Draw);

    {
        let t0 = s0.read().unwrap();
        let t1 = s1.read().unwrap();
        let t2 = s2.read().unwrap();
        apply_wgpu_effect_invert_tint_pass(state, source, &t0, color, alpha, strength);
        apply_wgpu_effect_box_blur(
            state,
            &t0,
            &t1,
            &t2,
            &WgpuEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(6.0)),
                blur_y: Some(effect.blur_y.unwrap_or(6.0)),
                passes: Some(quality),
                edge_color: Some(get_invert_tint_edge_color(color, alpha, strength)),
            },
        );
        apply_wgpu_effect_inner_clip_pass(state, &t1, source, &t0);

        clear_wgpu_effect_target(state, dest);
        if source_mode == InnerEffectSourceMode::Draw {
            apply_wgpu_effect_blit_pass(state, source, dest);
        }
        apply_wgpu_effect_blit_pass(state, &t0, dest);
    }

    release_wgpu_texture_render_target(pool, s0);
    release_wgpu_texture_render_target(pool, s1);
    release_wgpu_texture_render_target(pool, s2);
}

// The color is packed RGBA, so its own alpha multiplies the effect-level one before the premultiply.
fn get_invert_tint_edge_color(color: u32, alpha: f32, strength: f32) -> [f32; 4] {
    let mut edge = [0.0_f32; 4];
    unpack_color_rgba(&mut edge, color);
    let edge_alpha = 1.0_f32.min(alpha * edge[3] * strength);
    return [
        edge[0] * edge_alpha,
        edge[1] * edge_alpha,
        edge[2] * edge_alpha,
        edge_alpha,
    ];
}

/// Registers the default runner under `InnerGlowEffect` (TS `registerWgpuInnerGlowEffect`).
pub fn register_wgpu_inner_glow_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "InnerGlowEffect",
        wgpu_inner_glow_effect_runner,
        None,
    );
}

/// The default `InnerGlowEffect` runner (TS `wgpuInnerGlowEffectRunner`).
pub fn wgpu_inner_glow_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<InnerGlowEffect>(effect, "wgpuInnerGlowEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_inner_glow_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
