// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: applications run over render-wgpu render textures and pools
//! Effect chains applied from one completed render texture into another (TS
//! `wgpuRenderTextureEffect.ts`).

use flight_effects::EffectRef;
use flight_entity::{Kind, get_entity_id};
use flight_render::RenderTexture;
use flight_render_wgpu::{
    WgpuEffectContext, WgpuEffectRunner, WgpuRenderState, WgpuRenderTexturePool,
    get_wgpu_render_texture_target, write_wgpu_render_texture_target,
};

use crate::types::*;
use crate::wgpu_effect_registry::{get_wgpu_effect_runner, is_wgpu_effect_resolvable};
use crate::wgpu_effect_runtime::{get_wgpu_effect_runtime, peek_wgpu_effect_runtime};

/// Encodes the registered members of `effects` from `source` into `dest` (TS
/// `applyWgpuEffectsToRenderTexture`). The caller owns an active command encoder and supplies one
/// distinct `scratch` lease. Parity chooses the first destination so the final registered
/// operation always publishes `dest`. Returns `false`, without writing `dest`, when the source has
/// no realized target or no effect kind is registered; both cases are reported to the application
/// guard first.
pub fn apply_wgpu_effects_to_render_texture(
    state: &mut WgpuRenderState,
    pool: &mut WgpuRenderTexturePool,
    source: &RenderTexture,
    dest: &mut RenderTexture,
    scratch: &mut RenderTexture,
    effects: &[EffectRef],
) -> bool {
    let source_id = get_entity_id(source);
    let dest_id = get_entity_id(dest);
    let scratch_id = get_entity_id(scratch);
    if source_id == dest_id || source_id == scratch_id || dest_id == scratch_id {
        panic!("applyWgpuEffectsToRenderTexture: source, destination, and scratch must be distinct");
    }
    let source_target = get_wgpu_render_texture_target(state, source);
    let mut unregistered_kinds: Vec<Kind> = Vec::new();
    let mut unresolved_indexes: Vec<usize> = Vec::new();
    let mut operations: Vec<(EffectRef, WgpuEffectRunner)> = Vec::new();
    for (index, effect) in effects.iter().enumerate() {
        let kind = effect.read().unwrap().effect_fields().kind.clone();
        let Some(runner) = get_wgpu_effect_runner(state, &kind) else {
            unregistered_kinds.push(kind);
            continue;
        };
        if !is_wgpu_effect_resolvable(state, &*effect.read().unwrap()) {
            unresolved_indexes.push(index);
        }
        operations.push((effect.clone(), runner));
    }
    // Reported BEFORE either early return: a false return that never wrote `dest` leaves whatever
    // a consumer last sampled in place, which reads as a stale frame rather than a failed call.
    let destination_available = get_wgpu_render_texture_target(state, dest).is_some();
    let explanation = WgpuEffectApplicationExplanation {
        registered_count: operations.len(),
        requested_count: effects.len(),
        status: get_wgpu_effect_application_status(
            effects.len(),
            operations.len(),
            unresolved_indexes.len(),
            source_target.is_some(),
            destination_available,
        ),
        unregistered_kinds,
        unresolved_indexes,
    };
    report_wgpu_effect_application(state, &explanation);
    let Some(source_target) = source_target else {
        return false;
    };
    if operations.is_empty() {
        return false;
    }

    let mut current = source_target;
    let count = operations.len();
    for (index, (effect, runner)) in operations.iter().enumerate() {
        let remaining = count - index;
        let output: &mut RenderTexture = if remaining % 2 == 1 {
            &mut *dest
        } else {
            &mut *scratch
        };
        let input = current.clone();
        let effect_targets = &mut pool.effect_targets;
        write_wgpu_render_texture_target(state, output, |state, target| {
            let effect = effect.read().unwrap();
            let mut context = WgpuEffectContext {
                state,
                source: input,
                dest: target.clone(),
                pool: effect_targets,
                scene_depth_texture: None,
                scene_velocity_texture: None,
            };
            runner(&mut context, &*effect);
        });
        current = get_wgpu_render_texture_target(state, output)
            .expect("a written render texture is ready");
    }
    return true;
}

/// Explains why an application would not do what the caller asked, as plain data (TS
/// `explainWgpuEffectApplication`).
pub fn explain_wgpu_effect_application(
    state: &mut WgpuRenderState,
    source: &RenderTexture,
    dest: &RenderTexture,
    effects: &[EffectRef],
) -> WgpuEffectApplicationExplanation {
    let mut unregistered_kinds: Vec<Kind> = Vec::new();
    let mut unresolved_indexes: Vec<usize> = Vec::new();
    for (index, effect) in effects.iter().enumerate() {
        let kind = effect.read().unwrap().effect_fields().kind.clone();
        if get_wgpu_effect_runner(state, &kind).is_none() {
            unregistered_kinds.push(kind);
        } else if !is_wgpu_effect_resolvable(state, &*effect.read().unwrap()) {
            unresolved_indexes.push(index);
        }
    }
    let registered_count = effects.len() - unregistered_kinds.len();
    let source_available = get_wgpu_render_texture_target(state, source).is_some();
    let destination_available = get_wgpu_render_texture_target(state, dest).is_some();
    return WgpuEffectApplicationExplanation {
        registered_count,
        requested_count: effects.len(),
        status: get_wgpu_effect_application_status(
            effects.len(),
            registered_count,
            unresolved_indexes.len(),
            source_available,
            destination_available,
        ),
        unregistered_kinds,
        unresolved_indexes,
    };
}

// An empty chain is a no-op the caller asked for, not a miss. A ready destination is the
// highest-cost failed-call outcome, because consumers keep sampling plausible pixels from an older
// application instead of an empty texture.
fn get_wgpu_effect_application_status(
    requested_count: usize,
    registered_count: usize,
    unresolved_count: usize,
    source_available: bool,
    destination_available: bool,
) -> WgpuEffectApplicationStatus {
    if requested_count == 0 {
        return WgpuEffectApplicationStatus::NoEffects;
    }
    if destination_available && (!source_available || registered_count == 0) {
        return WgpuEffectApplicationStatus::StaleDestination;
    }
    if !source_available {
        return WgpuEffectApplicationStatus::SourceUnavailable;
    }
    if registered_count == 0 {
        return WgpuEffectApplicationStatus::UnregisteredEffects;
    }
    if registered_count < requested_count {
        return WgpuEffectApplicationStatus::PartialRegistration;
    }
    if unresolved_count == 0 {
        return WgpuEffectApplicationStatus::Complete;
    }
    return if unresolved_count == registered_count {
        WgpuEffectApplicationStatus::UnresolvedEffects
    } else {
        WgpuEffectApplicationStatus::PartialResolution
    };
}

/// The string the source uses for an application status (D9e).
// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS WgpuEffectApplicationStatus string union; TS exports no get_/parse_ free functions
pub fn get_wgpu_effect_application_status_string(value: WgpuEffectApplicationStatus) -> &'static str {
    return match value {
        WgpuEffectApplicationStatus::Complete => "complete",
        WgpuEffectApplicationStatus::NoEffects => "no-effects",
        WgpuEffectApplicationStatus::PartialRegistration => "partial-registration",
        WgpuEffectApplicationStatus::PartialResolution => "partial-resolution",
        WgpuEffectApplicationStatus::SourceUnavailable => "source-unavailable",
        WgpuEffectApplicationStatus::StaleDestination => "stale-destination",
        WgpuEffectApplicationStatus::UnregisteredEffects => "unregistered-effects",
        WgpuEffectApplicationStatus::UnresolvedEffects => "unresolved-effects",
    };
}

/// The string table's inverse (D9e).
// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS WgpuEffectApplicationStatus string union; TS exports no get_/parse_ free functions
pub fn parse_wgpu_effect_application_status(value: &str) -> Option<WgpuEffectApplicationStatus> {
    return match value {
        "complete" => Some(WgpuEffectApplicationStatus::Complete),
        "no-effects" => Some(WgpuEffectApplicationStatus::NoEffects),
        "partial-registration" => Some(WgpuEffectApplicationStatus::PartialRegistration),
        "partial-resolution" => Some(WgpuEffectApplicationStatus::PartialResolution),
        "source-unavailable" => Some(WgpuEffectApplicationStatus::SourceUnavailable),
        "stale-destination" => Some(WgpuEffectApplicationStatus::StaleDestination),
        "unregistered-effects" => Some(WgpuEffectApplicationStatus::UnregisteredEffects),
        "unresolved-effects" => Some(WgpuEffectApplicationStatus::UnresolvedEffects),
        _ => None,
    };
}

fn report_wgpu_effect_application(state: &WgpuRenderState, explanation: &WgpuEffectApplicationExplanation) {
    if explanation.status == WgpuEffectApplicationStatus::Complete
        || explanation.status == WgpuEffectApplicationStatus::NoEffects
    {
        return;
    }
    let guard = peek_wgpu_effect_runtime(state).and_then(|runtime| runtime.application_guard.clone());
    if let Some(guard) = guard {
        guard(state, explanation);
    }
}

/// Installs or (with `None`) clears the application reporter (TS `setWgpuEffectApplicationGuard`):
/// the diagnostics seam the guard module fills.
pub fn set_wgpu_effect_application_guard(
    state: &mut WgpuRenderState,
    guard: Option<WgpuEffectApplicationGuard>,
) {
    get_wgpu_effect_runtime(state).application_guard = guard;
}
