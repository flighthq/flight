use std::sync::{Arc, RwLock};

use crate::animation_blend::{
    accumulate_animation_sample, add_animation_sample, create_animation_sample_accumulator,
    finish_animation_sample, reset_animation_sample_accumulator,
};
use crate::animation_player::advance_animation_player;
use crate::animation_track::sample_animation_track_ref;
use flight_entity::EntityRuntimeSlot;

use crate::types::*;

pub fn create_animation_blend_tree(inputs: &[AnimationBlendTreeInput]) -> AnimationBlendTree {
    let mut out = AnimationBlendTree::default();
    initialize_animation_blend_tree(&mut out, inputs);
    return out;
}

/// Creates a blend-tree input over `player` (TS `createAnimationBlendTreeInput`): weight 1, not
/// additive; weight and additive are assigned after creation (D23, Principal c0f9227c).
// flight-lint: allow(conform-params) D23 (Principal c0f9227c): the player stays positional; weight and additive are assigned after create
pub fn create_animation_blend_tree_input(player: AnimationPlayerRef) -> AnimationBlendTreeInput {
    return AnimationBlendTreeInput {
        additive: false,
        player,
        weight: 1.0,
        runtime: EntityRuntimeSlot::default(),
    };
}

pub fn create_animation_blend_tree_ref(
    inputs: &[AnimationBlendTreeInput],
) -> AnimationBlendTreeRef {
    return Arc::new(RwLock::new(create_animation_blend_tree(inputs)));
}

pub fn initialize_animation_blend_tree(
    out: &mut AnimationBlendTree,
    inputs: &[AnimationBlendTreeInput],
) {
    let copied_inputs: Vec<AnimationBlendTreeInput> = inputs.to_vec();
    let mut channels: Vec<AnimationBlendTreeChannel> = Vec::new();
    let mut channel_by_target: Vec<(TargetRef, usize)> = Vec::new();
    let mut players: Vec<AnimationPlayerRef> = Vec::new();
    let mut sample_width: usize = 0;

    for input_index in 0..copied_inputs.len() {
        let player_ref = &copied_inputs[input_index].player;
        if !players.iter().any(|p| Arc::ptr_eq(p, player_ref)) {
            players.push(player_ref.clone());
        }
        let player = player_ref.read().unwrap();
        let clip = player.clip.read().unwrap();
        let input_channels = &clip.channels;
        assert_unique_animation_blend_tree_targets(input_channels, input_index);
        for channel_index in 0..input_channels.len() {
            let channel = &input_channels[channel_index];
            let (components, quaternion) = {
                let track = channel.track.read().unwrap();
                (track.components, track.quaternion)
            };
            sample_width = sample_width.max(components);
            let existing_index = channel_by_target
                .iter()
                .find(|(t, _)| flight_entity::unknown_same_value_zero(t, &channel.target_ref))
                .map(|(_, i)| *i);
            if existing_index.is_none() {
                channel_by_target.push((channel.target_ref.clone(), channels.len()));
                channels.push(AnimationBlendTreeChannel {
                    accumulator: create_animation_sample_accumulator(components, quaternion),
                    channel: channel.clone(),
                    sources: vec![AnimationBlendTreeChannelSource {
                        channel_index,
                        input_index,
                    }],
                });
                continue;
            }
            let idx = existing_index.unwrap();
            let existing = &channels[idx];
            assert_compatible_animation_blend_tree_channels(&existing.channel, channel);
            channels[idx].sources.push(AnimationBlendTreeChannelSource {
                channel_index,
                input_index,
            });
        }
    }
    out.channels = channels;
    out.inputs = copied_inputs;
    out.players = players;
    out.sample_scratch = vec![0.0; sample_width];
}

/// Constructs a blend-tree input over `player` in place (TS `initializeAnimationBlendTreeInput`).
// flight-lint: allow(conform-params) D23 (Principal c0f9227c): the player stays positional; weight and additive are assigned after create
pub fn initialize_animation_blend_tree_input(
    out: &mut AnimationBlendTreeInput,
    player: AnimationPlayerRef,
) {
    out.additive = false;
    out.player = player;
    out.weight = 1.0;
}

pub fn advance_animation_blend_tree(tree: &AnimationBlendTree, dt: f32) {
    for player_ref in &tree.players {
        advance_animation_player(&mut player_ref.write().unwrap(), dt);
    }
}

fn assert_compatible_animation_blend_tree_channels(
    existing: &AnimationChannel,
    channel: &AnimationChannel,
) {
    let (existing_components, existing_quaternion) = {
        let track = existing.track.read().unwrap();
        (track.components, track.quaternion)
    };
    let (components, quaternion) = {
        let track = channel.track.read().unwrap();
        (track.components, track.quaternion)
    };
    if existing_components != components {
        panic!(
            "AnimationBlendTree target has different component widths ({} and {}).",
            existing_components, components
        );
    }
    if existing_quaternion != quaternion {
        panic!("AnimationBlendTree target has incompatible quaternion flags.");
    }
}

fn assert_unique_animation_blend_tree_targets(channels: &[AnimationChannel], input_index: usize) {
    let mut targets: Vec<TargetRef> = Vec::new();
    for channel in channels {
        if targets
            .iter()
            .any(|t| flight_entity::unknown_same_value_zero(t, &channel.target_ref))
        {
            panic!(
                "AnimationBlendTree input {} clip contains a duplicate targetRef.",
                input_index
            );
        }
        targets.push(channel.target_ref.clone());
    }
}

pub fn sample_animation_blend_tree(
    out: &mut [f32],
    tree: &mut AnimationBlendTree,
    visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
) {
    for index in 0..tree.channels.len() {
        let sampled = sample_animation_blend_tree_channel(out, tree, index);
        if sampled {
            let channel = tree.channels[index].channel.clone();
            visit(out, &channel, index);
        }
    }
}

pub fn sample_animation_blend_tree_channel(
    out: &mut [f32],
    tree: &mut AnimationBlendTree,
    channel_index: usize,
) -> bool {
    if channel_index >= tree.channels.len() {
        return false;
    }

    reset_animation_sample_accumulator(&mut tree.channels[channel_index].accumulator);
    let mut has_additive = false;

    let sources: Vec<AnimationBlendTreeChannelSource> =
        tree.channels[channel_index].sources.clone();
    for source in &sources {
        let input_additive = tree.inputs[source.input_index].additive;
        let input_weight = tree.inputs[source.input_index].weight;
        if input_additive || !(input_weight > 0.0) {
            if input_additive && input_weight > 0.0 {
                has_additive = true;
            }
            continue;
        }
        let player = tree.inputs[source.input_index].player.read().unwrap();
        let clip = player.clip.read().unwrap();
        let channel = &clip.channels[source.channel_index];
        sample_animation_track_ref(&mut tree.sample_scratch, &channel.track, player.time);
        let scratch_copy: Vec<f32> = tree.sample_scratch.clone();
        accumulate_animation_sample(
            &mut tree.channels[channel_index].accumulator,
            &scratch_copy,
            input_weight,
        );
    }

    let has_override = finish_animation_sample(out, &tree.channels[channel_index].accumulator);
    if !has_override && !has_additive {
        return false;
    }
    if !has_override {
        let (components, quaternion) = {
            let track = tree.channels[channel_index].channel.track.read().unwrap();
            (track.components, track.quaternion)
        };
        write_animation_blend_tree_identity(out, components, quaternion);
    }

    for source in &sources {
        let input_additive = tree.inputs[source.input_index].additive;
        let input_weight = tree.inputs[source.input_index].weight;
        if !input_additive || !(input_weight > 0.0) {
            continue;
        }
        let player = tree.inputs[source.input_index].player.read().unwrap();
        let clip = player.clip.read().unwrap();
        let channel = &clip.channels[source.channel_index];
        sample_animation_track_ref(&mut tree.sample_scratch, &channel.track, player.time);
        let scratch_copy: Vec<f32> = tree.sample_scratch.clone();
        let quaternion = channel.track.read().unwrap().quaternion;
        add_animation_sample(out, &out.to_vec(), &scratch_copy, input_weight, quaternion);
    }

    return true;
}

pub fn set_animation_blend_tree_input_weight(
    tree: &mut AnimationBlendTree,
    input_index: usize,
    weight: f32,
) -> bool {
    if input_index >= tree.inputs.len() {
        return false;
    }
    tree.inputs[input_index].weight = weight;
    return true;
}

fn write_animation_blend_tree_identity(out: &mut [f32], components: usize, quaternion: bool) {
    let width = out.len().min(components);
    for component in 0..width {
        out[component] = 0.0;
    }
    if quaternion && width >= 4 {
        out[3] = 1.0;
    }
}
