use crate::animation_advance::advance_animation_players;
use crate::types::*;

pub fn advance_animation_state_machine_with_scratch(
    machine: &mut AnimationStateMachine,
    dt: f32,
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
    machine.transition_weight = (machine.transition_curve)(
        get_linear_animation_state_machine_transition_weight(
            machine.transition_elapsed,
            machine.transition_duration,
        ),
    );
    if machine.transition_duration <= 0.0 || machine.transition_elapsed >= machine.transition_duration
    {
        machine.current_state_index = to_idx;
        machine.transition_from_state_index = None;
        machine.transition_to_state_index = None;
    }
}

fn get_linear_animation_state_machine_transition_weight(elapsed: f32, duration: f32) -> f32 {
    if duration <= 0.0 {
        return 1.0;
    }
    let normalized = elapsed / duration;
    return if normalized < 0.0 {
        0.0
    } else if normalized > 1.0 {
        1.0
    } else {
        normalized
    };
}
