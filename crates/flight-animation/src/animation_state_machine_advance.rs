//! flight-compiler: target-native

use crate::animation_advance::advance_animation_players;
use crate::types::*;

pub fn advance_animation_state_machine_with_scratch(
    machine: &mut AnimationStateMachine,
    dt: f64,
    advanced: &mut Vec<AnimationPlayerRef>,
) {
    {
        let tree = machine.states[machine.current_state_index]
            .blend_tree
            .read()
            .unwrap();
        advance_animation_players(&tree.players, dt, advanced);
    }

    let to_index = machine.transition_to_state_index;
    if to_index.is_none() {
        return;
    }
    let to_idx = to_index.unwrap();

    {
        let tree = machine.states[to_idx].blend_tree.read().unwrap();
        advance_animation_players(&tree.players, dt, advanced);
    }

    machine.transition_elapsed += dt;
    machine.transition_weight =
        (machine.transition_curve)(get_linear_animation_state_machine_transition_weight(
            machine.transition_elapsed,
            machine.transition_duration,
        ));
    if machine.transition_duration <= 0.0
        || machine.transition_elapsed >= machine.transition_duration
    {
        machine.current_state_index = to_idx;
        machine.transition_from_state_index = None;
        machine.transition_to_state_index = None;
    }
}

// flight-lint: allow(f32) transition weight is a bounded 0-1 blend weight
fn get_linear_animation_state_machine_transition_weight(elapsed: f64, duration: f64) -> f32 {
    if duration <= 0.0 {
        return 1.0;
    }
    let normalized = elapsed / duration;
    // f64 time narrows only here, once clamped to the bounded 0-1 weight range.
    return normalized.clamp(0.0, 1.0) as f32;
}
