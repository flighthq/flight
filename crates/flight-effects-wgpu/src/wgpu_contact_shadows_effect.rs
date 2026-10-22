// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Contact shadows (TS `wgpuContactShadowsEffect.ts`): mirrors the GL contact-shadow leaf through
//! the existing local-occlusion (SSAO) realization. The runner stays independently replaceable for
//! when the effect context gains a sampleable depth target.

use flight_effects::{ContactShadowsEffect, Effect, create_ssao_effect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_ssao_effect::apply_ssao_effect_to_wgpu;

/// Realizes the contact descriptor as an SSAO pass from `source` into `dest` (TS
/// `applyContactShadowsEffectToWgpu`): opacity becomes intensity, distance the radius.
pub fn apply_contact_shadows_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &ContactShadowsEffect,
) {
    let ssao = create_ssao_effect();
    {
        let mut ssao = ssao.write().unwrap();
        ssao.intensity = Some(effect.opacity.unwrap_or(0.6));
        ssao.radius = Some(effect.distance.unwrap_or(0.5));
        ssao.samples = Some(effect.samples.unwrap_or(16.0));
    }
    apply_ssao_effect_to_wgpu(state, source, dest, &ssao.read().unwrap());
}

/// Registers the default runner under `ContactShadowsEffect` (TS
/// `registerWgpuContactShadowsEffect`).
pub fn register_wgpu_contact_shadows_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "ContactShadowsEffect",
        wgpu_contact_shadows_effect_runner,
        None,
    );
}

/// The default `ContactShadowsEffect` runner (TS `wgpuContactShadowsEffectRunner`).
pub fn wgpu_contact_shadows_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect =
        downcast_wgpu_effect::<ContactShadowsEffect>(effect, "wgpuContactShadowsEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_contact_shadows_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
