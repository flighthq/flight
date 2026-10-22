// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Contact shadows share the local-occlusion realization used by SSAO until the effect pipeline
//! exposes a sampleable depth attachment. Keeping the mapping in its own leaf gives the public
//! descriptor a real, replaceable runner.

use flight_effects::{ContactShadowsEffect, Effect, create_ssao_effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget};

use crate::contract::{GlEffectContext, apply_ssao_effect_to_gl, register_gl_effect};

pub fn apply_contact_shadows_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &ContactShadowsEffect,
) -> Result<(), String> {
    let ssao = create_ssao_effect();
    let mut ssao = ssao
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    ssao.intensity = Some(effect.opacity.unwrap_or(0.6));
    ssao.radius = Some(effect.distance.unwrap_or(0.5));
    ssao.samples = Some(effect.samples.unwrap_or(16.0));
    return apply_ssao_effect_to_gl(state, source, dest, &ssao);
}

pub fn gl_contact_shadows_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<ContactShadowsEffect>() else {
        return Ok(());
    };
    return apply_contact_shadows_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_contact_shadows_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "ContactShadowsEffect",
        gl_contact_shadows_effect_runner,
        None,
    );
}
