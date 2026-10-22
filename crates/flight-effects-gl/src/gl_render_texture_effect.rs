// flight-lint: allow-file(contract-vocabulary) D17 render-texture effect application borrows render-gl's Rc/RefCell target entries and returns Result diagnostics
//! The explicit per-node target-to-target path: applies the registered members of an effect chain
//! from one RenderTexture to another over render-gl's leases, separate from the pipeline.

use std::any::Any;
use std::sync::PoisonError;

use flight_effects::{Effect, EffectRef};
use flight_entity::{get_entity_id, throw_error};
use flight_render::{RenderTarget, RenderTexture};
use flight_render_gl::{
    GlRenderState, GlRenderTexturePool, GlRenderTextureStatus, explain_gl_render_texture,
    get_gl_render_texture_target, with_gl_render_state, write_gl_render_texture_target,
};

use crate::contract::{
    GlEffectApplicationExplanation, GlEffectApplicationGuard, GlEffectApplicationStatus,
    GlEffectContext, GlEffectRunner, get_gl_effect_runner, is_gl_effect_resolvable,
};
use crate::gl_effect_support::with_gl_effect_state_runtime;

/// Applies the registered members of a chain from one RenderTexture to another. Each effect
/// composites into its destination and this function never clears `dest` or `scratch`; callers
/// reusing either texture across frames must clear it first with `clear_gl_render_texture`.
/// Returns `false` (destination unwritten) when the source has no realized GL target or no effect
/// kind has a runner. Source, destination and scratch must be distinct render textures.
// flight-lint: allow(conform-params) D17 the native application returns render-gl's Result diagnostics
pub fn apply_gl_effects_to_render_texture(
    state: &mut GlRenderState,
    pool: &mut GlRenderTexturePool,
    source: &RenderTexture,
    dest: &mut RenderTexture,
    scratch: &mut RenderTexture,
    effects: &[EffectRef],
) -> Result<bool, String> {
    assert_distinct_render_textures(
        source,
        dest,
        scratch,
        "applyGlEffectsToRenderTexture: source, destination, and scratch must be distinct",
    );
    let source_entry = get_gl_render_texture_target(state, source);
    let mut operations: Vec<(EffectRef, GlEffectRunner)> = Vec::new();
    for effect in effects {
        let kind = effect
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .effect_fields()
            .kind
            .clone();
        if let Some(runner) = get_gl_effect_runner(state, &kind) {
            operations.push((effect.clone(), runner));
        }
    }
    // Report BEFORE returning: both sentinel exits below leave `dest` unchanged.
    let destination_available =
        explain_gl_render_texture(state, &*dest).status == GlRenderTextureStatus::Ready;
    let explanation = explain_gl_effect_application(
        state,
        effects,
        source_entry.is_some(),
        Some(destination_available),
    );
    report_gl_effect_application(state, &explanation);
    let Some(source_entry) = source_entry else {
        return Ok(false);
    };
    if operations.is_empty() {
        return Ok(false);
    }

    let effect_targets = &mut pool.effect_targets;
    return with_gl_render_state(state, |state| -> Result<bool, String> {
        let mut current = source_entry;
        let count = operations.len();
        for (index, (effect, runner)) in operations.iter().enumerate() {
            let remaining = count - index;
            let output: &mut RenderTexture = if remaining % 2 == 1 {
                &mut *dest
            } else {
                &mut *scratch
            };
            let current_entry = current.clone();
            write_gl_render_texture_target(state, output, |state, target| {
                let current_borrow = current_entry.borrow();
                let effect = effect.read().unwrap_or_else(PoisonError::into_inner);
                let mut context = GlEffectContext {
                    state,
                    source: &current_borrow.target,
                    dest: target,
                    pool: &mut *effect_targets,
                    scene_depth_texture: None,
                    scene_velocity_texture: None,
                };
                return runner(&mut context, &*effect);
            })?;
            current = get_gl_render_texture_target(state, output).ok_or_else(|| {
                "applyGlEffectsToRenderTexture: written target is not ready".to_string()
            })?;
        }
        return Ok(true);
    });
}

pub(crate) fn assert_distinct_render_textures(
    source: &RenderTexture,
    dest: &RenderTexture,
    scratch: &RenderTexture,
    message: &str,
) {
    let source_id = get_render_texture_target_id(source);
    let dest_id = get_render_texture_target_id(dest);
    let scratch_id = get_render_texture_target_id(scratch);
    if (source_id.is_some() && (source_id == dest_id || source_id == scratch_id))
        || (dest_id.is_some() && dest_id == scratch_id)
    {
        throw_error(message);
    }
}

/// Why an apply call would (or would not) write its destination, without performing it. Pure query
/// over the same registry the apply path consults. `source_available` reports whether the source
/// RenderTexture has a realized GL target; `destination_available` (default `false`) reports
/// whether a failed call would leave previously published pixels behind.
pub fn explain_gl_effect_application(
    state: &mut GlRenderState,
    effects: &[EffectRef],
    source_available: bool,
    destination_available: Option<bool>,
) -> GlEffectApplicationExplanation {
    let destination_available = destination_available.unwrap_or(false);
    let mut unregistered_kinds = Vec::new();
    let mut unresolved_indexes = Vec::new();
    for (index, effect) in effects.iter().enumerate() {
        let effect = effect.read().unwrap_or_else(PoisonError::into_inner);
        let kind = &effect.effect_fields().kind;
        if get_gl_effect_runner(state, kind).is_none() {
            unregistered_kinds.push(kind.clone());
        } else if !is_gl_effect_resolvable(state, &*effect as &dyn Effect) {
            unresolved_indexes.push(index);
        }
    }
    let requested_count = effects.len();
    let registered_count = requested_count - unregistered_kinds.len();
    let status = if requested_count == 0 {
        GlEffectApplicationStatus::NoEffects
    } else if destination_available && (!source_available || registered_count == 0) {
        GlEffectApplicationStatus::StaleDestination
    } else if !source_available {
        GlEffectApplicationStatus::SourceUnavailable
    } else if registered_count == 0 {
        GlEffectApplicationStatus::UnregisteredEffects
    } else if !unregistered_kinds.is_empty() {
        GlEffectApplicationStatus::PartialRegistration
    } else if unresolved_indexes.is_empty() {
        GlEffectApplicationStatus::Complete
    } else if unresolved_indexes.len() == registered_count {
        GlEffectApplicationStatus::UnresolvedEffects
    } else {
        GlEffectApplicationStatus::PartialResolution
    };
    return GlEffectApplicationExplanation {
        registered_count,
        requested_count,
        status,
        unregistered_kinds,
        unresolved_indexes,
    };
}

// flight-lint: allow(conform-extra) D9e string table for the TS GlEffectApplicationStatus union
pub fn get_gl_effect_application_status_string(value: GlEffectApplicationStatus) -> &'static str {
    return match value {
        GlEffectApplicationStatus::Complete => "complete",
        GlEffectApplicationStatus::NoEffects => "no-effects",
        GlEffectApplicationStatus::PartialRegistration => "partial-registration",
        GlEffectApplicationStatus::PartialResolution => "partial-resolution",
        GlEffectApplicationStatus::SourceUnavailable => "source-unavailable",
        GlEffectApplicationStatus::StaleDestination => "stale-destination",
        GlEffectApplicationStatus::UnregisteredEffects => "unregistered-effects",
        GlEffectApplicationStatus::UnresolvedEffects => "unresolved-effects",
    };
}

fn get_render_texture_target_id(render_texture: &RenderTexture) -> Option<u64> {
    let source = render_texture.source.as_ref()?;
    let source = source.read().unwrap_or_else(PoisonError::into_inner);
    let target = (&*source as &dyn Any).downcast_ref::<RenderTarget>()?;
    return Some(get_entity_id(target));
}

// flight-lint: allow(conform-extra) D9e string table for the TS GlEffectApplicationStatus union
pub fn parse_gl_effect_application_status(value: &str) -> Option<GlEffectApplicationStatus> {
    return match value {
        "complete" => Some(GlEffectApplicationStatus::Complete),
        "no-effects" => Some(GlEffectApplicationStatus::NoEffects),
        "partial-registration" => Some(GlEffectApplicationStatus::PartialRegistration),
        "partial-resolution" => Some(GlEffectApplicationStatus::PartialResolution),
        "source-unavailable" => Some(GlEffectApplicationStatus::SourceUnavailable),
        "stale-destination" => Some(GlEffectApplicationStatus::StaleDestination),
        "unregistered-effects" => Some(GlEffectApplicationStatus::UnregisteredEffects),
        "unresolved-effects" => Some(GlEffectApplicationStatus::UnresolvedEffects),
        _ => None,
    };
}

fn report_gl_effect_application(
    state: &GlRenderState,
    explanation: &GlEffectApplicationExplanation,
) {
    if explanation.status == GlEffectApplicationStatus::Complete
        || explanation.status == GlEffectApplicationStatus::NoEffects
    {
        return;
    }
    let guard = with_gl_effect_state_runtime(state, |runtime| runtime.application_guard.clone());
    if let Some(guard) = guard {
        guard(state, explanation);
    }
}

/// The diagnostics seam for the render-texture path. `None` clears it.
pub fn set_gl_effect_application_guard(
    state: &GlRenderState,
    guard: Option<GlEffectApplicationGuard>,
) {
    with_gl_effect_state_runtime(state, |runtime| runtime.application_guard = guard);
}
