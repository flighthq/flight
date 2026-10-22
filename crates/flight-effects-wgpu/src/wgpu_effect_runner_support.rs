//! Shared runner plumbing: the checked narrowing of a registered effect to its intent type.

use flight_effects::Effect;

// The source casts the registry's effect to the runner's intent type (`effect as BlurEffect`); the
// registry key is what makes that cast safe. Rust checks it: a runner reached with a different
// intent type was registered under the wrong kind, a programmer error (D10).
pub(crate) fn downcast_wgpu_effect<'a, T: 'static>(effect: &'a dyn Effect, runner: &str) -> &'a T {
    let Some(effect) = effect.as_any().downcast_ref::<T>() else {
        panic!(
            "{runner}: effect kind \"{}\" is registered to a runner for a different effect type",
            effect.effect_fields().kind
        );
    };
    return effect;
}
