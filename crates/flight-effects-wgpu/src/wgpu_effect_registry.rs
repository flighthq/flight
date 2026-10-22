// flight-lint: allow-file(contract-vocabulary) D17: registry seams take the open Effect family as `&dyn Effect` and render-wgpu runner/resolver function values
//! Per-state registry mapping an effect `kind` to its WebGPU runner (TS `wgpuEffectRegistry.ts`):
//! the material-renderer pattern one tier up. Registration is opt-in and dispatch is a map lookup,
//! so there is no monolithic switch. Register an alternative runner under the same key to swap
//! algorithms. A built-in `register_wgpu_<kind>_effect` wrapper only calls `register_wgpu_effect`
//! with the literal kind and public default runner.

use std::sync::Arc;

use flight_effects::Effect;
use flight_registry::with_kind_map_entry;
use flight_render_wgpu::{
    WgpuEffectRegistration, WgpuEffectResolver, WgpuEffectRunner, WgpuRenderState,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

/// The runner registered for `kind` on this state, or `None` (TS `getWgpuEffectRunner`).
pub fn get_wgpu_effect_runner(state: &WgpuRenderState, kind: &str) -> Option<WgpuEffectRunner> {
    return get_wgpu_render_state_runtime(state)
        .registries
        .effects
        .entries
        .get(kind)
        .map(|entry| entry.runner);
}

/// Whether a runner is registered for `kind` on this state (TS `hasWgpuEffectRunner`). The
/// pipeline silently skips unregistered kinds; check up front to apply your own policy.
pub fn has_wgpu_effect_runner(state: &WgpuRenderState, kind: &str) -> bool {
    return get_wgpu_render_state_runtime(state)
        .registries
        .effects
        .entries
        .contains_key(kind);
}

/// Whether this effect instance resolves (TS `isWgpuEffectResolvable`): its kind is registered
/// and its registration has no resolver or the resolver accepts it.
pub fn is_wgpu_effect_resolvable(state: &mut WgpuRenderState, effect: &dyn Effect) -> bool {
    let entry = get_wgpu_render_state_runtime(state)
        .registries
        .effects
        .entries
        .get(&effect.effect_fields().kind)
        .copied();
    let Some(entry) = entry else {
        return false;
    };
    return match entry.is_resolvable {
        None => true,
        Some(is_resolvable) => is_resolvable(state, effect),
    };
}

/// Registers `runner` (and its optional per-instance resolver) for `kind` on this state (TS
/// `registerWgpuEffect`). Last write wins; earlier registry snapshots are not mutated.
pub fn register_wgpu_effect(
    state: &mut WgpuRenderState,
    kind: &str,
    runner: WgpuEffectRunner,
    is_resolvable: Option<WgpuEffectResolver>,
) {
    let registries = &mut get_wgpu_render_state_runtime_mut(state).registries;
    registries.effects = Arc::new(with_kind_map_entry(
        &registries.effects,
        kind.to_string(),
        WgpuEffectRegistration {
            is_resolvable,
            runner,
        },
    ));
}
