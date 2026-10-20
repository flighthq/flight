use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::animation_blend::blend_animation_samples;
use crate::animation_blend_tree::sample_animation_blend_tree_channel;
use crate::animation_state_machine_advance::advance_animation_state_machine_with_scratch;
use crate::types::*;

pub fn advance_animation_state_machine(machine: &mut AnimationStateMachine, dt: f32) {
    let mut advanced: Vec<AnimationPlayerRef> = Vec::new();
    std::mem::swap(&mut machine.advance_scratch, &mut advanced);
    advanced.clear();
    advance_animation_state_machine_with_scratch(machine, dt, &mut advanced);
    machine.advance_scratch = advanced;
}

pub fn create_animation_state_machine(
    states: &[AnimationStateMachineState],
    initial_state: Option<StateRef>,
) -> AnimationStateMachine {
    let mut out = AnimationStateMachine::default();
    initialize_animation_state_machine(&mut out, states, initial_state);
    return out;
}

pub fn create_animation_state_machine_state(
    name: &str,
    blend_tree: AnimationBlendTreeRef,
) -> AnimationStateMachineState {
    let mut out = AnimationStateMachineState::default();
    initialize_animation_state_machine_state(&mut out, name, blend_tree);
    return out;
}

pub fn get_animation_state_machine_current_state(
    machine: &AnimationStateMachine,
) -> &AnimationStateMachineState {
    return &machine.states[machine.current_state_index];
}

pub fn initialize_animation_state_machine(
    out: &mut AnimationStateMachine,
    states: &[AnimationStateMachineState],
    initial_state: Option<StateRef>,
) {
    if states.is_empty() {
        panic!("AnimationStateMachine requires at least one state.");
    }
    let copied_states: Vec<AnimationStateMachineState> = states.to_vec();
    let mut state_by_name: HashMap<String, usize> = HashMap::new();
    for index in 0..copied_states.len() {
        let name = &copied_states[index].name;
        if state_by_name.contains_key(name) {
            panic!(
                "AnimationStateMachine contains duplicate state \"{}\".",
                name
            );
        }
        state_by_name.insert(name.clone(), index);
    }

    let initial_state_index = match initial_state.unwrap_or(StateRef::Index(0)) {
        StateRef::Index(i) => i,
        StateRef::Name(ref name) => state_by_name
            .get(name)
            .copied()
            .unwrap_or(copied_states.len()),
    };

    if initial_state_index >= copied_states.len() {
        panic!(
            "AnimationStateMachine initial state does not exist."
        );
    }

    let channels = create_animation_state_machine_channels(&copied_states);
    let mut sample_width: usize = 0;
    for entry in &channels {
        sample_width = sample_width.max(entry.channel.track.components);
    }

    out.advance_scratch = Vec::new();
    out.channels = channels;
    out.current_state_index = initial_state_index;
    out.from_sample = vec![0.0; sample_width];
    out.states = copied_states;
    out.to_sample = vec![0.0; sample_width];
    out.transition_curve = linear_animation_state_machine_curve;
    out.transition_duration = 0.0;
    out.transition_elapsed = 0.0;
    out.transition_from_state_index = None;
    out.transition_to_state_index = None;
    out.transition_weight = 0.0;
}

pub fn initialize_animation_state_machine_state(
    out: &mut AnimationStateMachineState,
    name: &str,
    blend_tree: AnimationBlendTreeRef,
) {
    out.blend_tree = blend_tree;
    out.name = name.to_string();
}

pub fn is_animation_state_machine_transitioning(machine: &AnimationStateMachine) -> bool {
    return machine.transition_to_state_index.is_some();
}

pub fn sample_animation_state_machine(
    out: &mut [f32],
    machine: &mut AnimationStateMachine,
    visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
) {
    for index in 0..machine.channels.len() {
        let sampled = sample_animation_state_machine_channel(out, machine, index);
        if sampled {
            let channel = machine.channels[index].channel.clone();
            visit(out, &channel, index);
        }
    }
}

pub fn sample_animation_state_machine_channel(
    out: &mut [f32],
    machine: &mut AnimationStateMachine,
    channel_index: usize,
) -> bool {
    if channel_index >= machine.channels.len() {
        return false;
    }

    let to_state_index = machine.transition_to_state_index;
    if to_state_index.is_none() {
        let current_channel_index =
            machine.channels[channel_index].state_channel_indices[machine.current_state_index];
        if current_channel_index.is_none() {
            return false;
        }
        let ci = current_channel_index.unwrap();
        let mut tree = machine.states[machine.current_state_index]
            .blend_tree
            .borrow_mut();
        return sample_animation_blend_tree_channel(out, &mut tree, ci);
    }

    let to_idx = to_state_index.unwrap();
    let from_state_index = machine.transition_from_state_index.unwrap();
    let from_channel_index =
        machine.channels[channel_index].state_channel_indices[from_state_index];
    let to_channel_index = machine.channels[channel_index].state_channel_indices[to_idx];

    let has_from = if let Some(fci) = from_channel_index {
        let mut tree = machine.states[from_state_index].blend_tree.borrow_mut();
        sample_animation_blend_tree_channel(&mut machine.from_sample, &mut tree, fci)
    } else {
        false
    };

    let has_to = if let Some(tci) = to_channel_index {
        let mut tree = machine.states[to_idx].blend_tree.borrow_mut();
        sample_animation_blend_tree_channel(&mut machine.to_sample, &mut tree, tci)
    } else {
        false
    };

    if !has_from && !has_to {
        return false;
    }
    if has_from && has_to {
        let from_copy: Vec<f32> = machine.from_sample.clone();
        let to_copy: Vec<f32> = machine.to_sample.clone();
        blend_animation_samples(
            out,
            &from_copy,
            &to_copy,
            machine.transition_weight,
            machine.channels[channel_index].channel.track.quaternion,
        );
    } else {
        let source = if has_from {
            &machine.from_sample
        } else {
            &machine.to_sample
        };
        let width = out
            .len()
            .min(machine.channels[channel_index].channel.track.components)
            .min(source.len());
        for component in 0..width {
            out[component] = source[component];
        }
    }
    return true;
}

pub fn transition_animation_state_machine(
    machine: &mut AnimationStateMachine,
    to_state: StateRef,
    duration: f32,
    curve: Option<EasingFn>,
) -> bool {
    if machine.transition_to_state_index.is_some() {
        return false;
    }
    let to_state_index = find_animation_state_machine_state_index(&machine.states, &to_state);
    if to_state_index < 0 || to_state_index as usize == machine.current_state_index {
        return false;
    }
    let to_idx = to_state_index as usize;
    let curve_fn = curve.unwrap_or(linear_animation_state_machine_curve);
    machine.transition_curve = curve_fn;
    machine.transition_duration = f32::max(0.0, duration);
    machine.transition_elapsed = 0.0;
    machine.transition_from_state_index = Some(machine.current_state_index);
    machine.transition_to_state_index = Some(to_idx);
    machine.transition_weight = curve_fn(get_linear_animation_state_machine_transition_weight(
        0.0,
        machine.transition_duration,
    ));
    if machine.transition_duration == 0.0 {
        machine.current_state_index = to_idx;
        machine.transition_from_state_index = None;
        machine.transition_to_state_index = None;
    }
    return true;
}

// Helper to create a shared ref
pub fn create_animation_state_machine_ref(
    states: &[AnimationStateMachineState],
    initial_state: Option<StateRef>,
) -> AnimationStateMachineRef {
    return Rc::new(RefCell::new(create_animation_state_machine(
        states,
        initial_state,
    )));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn assert_compatible_animation_state_machine_channels(
    existing: &AnimationChannel,
    channel: &AnimationChannel,
) {
    if existing.track.components != channel.track.components
        || existing.track.quaternion != channel.track.quaternion
    {
        panic!("AnimationStateMachine target has incompatible tracks across states.");
    }
}

fn create_animation_state_machine_channels(
    states: &[AnimationStateMachineState],
) -> Vec<AnimationStateMachineChannel> {
    let mut channels: Vec<AnimationStateMachineChannel> = Vec::new();
    let mut channel_by_target: HashMap<TargetRef, usize> = HashMap::new();

    for state_index in 0..states.len() {
        let tree = states[state_index].blend_tree.borrow();
        let state_channels = &tree.channels;
        for state_channel_index in 0..state_channels.len() {
            let channel = &state_channels[state_channel_index].channel;
            let existing_index = channel_by_target.get(&channel.target_ref).copied();
            if existing_index.is_none() {
                let mut state_channel_indices: Vec<Option<usize>> = vec![None; states.len()];
                state_channel_indices[state_index] = Some(state_channel_index);
                channel_by_target.insert(channel.target_ref, channels.len());
                channels.push(AnimationStateMachineChannel {
                    channel: channel.clone(),
                    state_channel_indices,
                });
                continue;
            }
            let idx = existing_index.unwrap();
            let existing = &channels[idx];
            assert_compatible_animation_state_machine_channels(
                &existing.channel,
                channel,
            );
            channels[idx].state_channel_indices[state_index] = Some(state_channel_index);
        }
    }
    return channels;
}

fn find_animation_state_machine_state_index(
    states: &[AnimationStateMachineState],
    state: &StateRef,
) -> i32 {
    match state {
        StateRef::Index(i) => {
            if *i < states.len() {
                return *i as i32;
            }
            return -1;
        }
        StateRef::Name(name) => {
            for index in 0..states.len() {
                if states[index].name == *name {
                    return index as i32;
                }
            }
            return -1;
        }
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

fn linear_animation_state_machine_curve(t: f32) -> f32 {
    return t;
}
