// flight-lint: allow-file(contract-vocabulary) D17 GL effect registry dispatches over the open Effect family through the render-gl registration slot
//! Per-state registry mapping an effect `kind` string to its GL runner — the material-renderer
//! pattern one tier up. Registration is opt-in and dispatch is a map lookup, so there is no
//! monolithic switch. Register an alternative runner under the same key to swap algorithms. A
//! built-in `register_gl_<kind>_effect` wrapper is pure ergonomics: it calls `register_gl_effect`
//! with the literal kind and public default runner.
//!
//! The registrations live in render-gl's `GlRenderRegistries.effects` table (TS
//! `registries.effects`), which render-gl holds opaquely: the value type is owned here.

use std::sync::Arc;

use flight_effects::Effect;
use flight_registry::with_kind_map_entry;
use flight_render_gl::GlRenderState;

use crate::contract::{GlEffectRegistration, GlEffectResolver, GlEffectRunner};

fn get_gl_effect_registration(state: &GlRenderState, kind: &str) -> Option<GlEffectRegistration> {
    return state
        .gl_registries
        .effects
        .entries
        .get(kind)
        .and_then(|value| value.downcast_ref::<GlEffectRegistration>())
        .copied();
}

pub fn get_gl_effect_runner(state: &GlRenderState, kind: &str) -> Option<GlEffectRunner> {
    return get_gl_effect_registration(state, kind).map(|entry| entry.runner);
}

/// Returns true if a runner is registered for the given kind in this state. Use to validate an
/// effect chain before dispatching — the pipeline silently skips unregistered kinds.
pub fn has_gl_effect_runner(state: &GlRenderState, kind: &str) -> bool {
    return get_gl_effect_registration(state, kind).is_some();
}

/// Whether this specific effect INSTANCE can resolve into a real pass — a separate axis from
/// whether its kind has a runner. A kind registered without a resolver is always resolvable; an
/// unregistered kind is not resolvable because there is nothing to resolve it with.
pub fn is_gl_effect_resolvable(state: &mut GlRenderState, effect: &dyn Effect) -> bool {
    let Some(entry) = get_gl_effect_registration(state, &effect.effect_fields().kind) else {
        return false;
    };
    return match entry.is_resolvable {
        None => true,
        Some(is_resolvable) => is_resolvable(state, effect),
    };
}

/// Registers `runner` (and the optional per-instance `is_resolvable` query) under `kind`. The
/// registration table is replaced, never mutated, so a state derived earlier keeps its snapshot.
pub fn register_gl_effect(
    state: &mut GlRenderState,
    kind: &str,
    runner: GlEffectRunner,
    is_resolvable: Option<GlEffectResolver>,
) {
    let registration: flight_entity::UnknownValue = Arc::new(GlEffectRegistration {
        is_resolvable,
        runner,
    });
    state.gl_registries.effects = Arc::new(with_kind_map_entry(
        &state.gl_registries.effects,
        kind.to_string(),
        registration,
    ));
}
