use std::sync::Arc;

use crate::animation_advance::advance_animation_players;
use crate::animation_blend::{add_animation_sample, blend_animation_samples};
use crate::animation_blend_tree::sample_animation_blend_tree_channel;
use crate::animation_state_machine::sample_animation_state_machine_channel;
use crate::animation_state_machine_advance::advance_animation_state_machine_with_scratch;
use crate::types::*;

pub fn create_animation_blend_tree_layer(
    blend_tree: AnimationBlendTreeRef,
    options: Option<&AnimationLayerOptions>,
) -> AnimationLayer {
    let channel_count = blend_tree.read().unwrap().channels.len();
    return create_animation_layer(channel_count, Some(blend_tree), None, options);
}

fn create_animation_layer(
    channel_count: usize,
    blend_tree: Option<AnimationBlendTreeRef>,
    state_machine: Option<AnimationStateMachineRef>,
    options: Option<&AnimationLayerOptions>,
) -> AnimationLayer {
    let channel_indices = copy_animation_layer_channel_indices(
        options.and_then(|o| o.channel_indices.as_ref()),
        channel_count,
    );
    let mut out = AnimationLayer::default();
    out.additive = options.and_then(|o| o.additive).unwrap_or(false);
    out.blend_tree = blend_tree;
    out.channel_indices = channel_indices;
    out.state_machine = state_machine;
    out.weight = options.and_then(|o| o.weight).unwrap_or(1.0);
    return out;
}

pub fn create_animation_layer_stack(layers: &[AnimationLayer]) -> AnimationLayerStack {
    let mut out = AnimationLayerStack::default();
    initialize_animation_layer_stack(&mut out, layers);
    return out;
}

pub fn create_animation_state_machine_layer(
    state_machine: AnimationStateMachineRef,
    options: Option<&AnimationLayerOptions>,
) -> AnimationLayer {
    let channel_count = state_machine.read().unwrap().channels.len();
    return create_animation_layer(channel_count, None, Some(state_machine), options);
}

pub fn initialize_animation_layer_stack(out: &mut AnimationLayerStack, layers: &[AnimationLayer]) {
    let copied_layers: Vec<AnimationLayer> = layers.to_vec();
    let mut blend_trees: Vec<AnimationBlendTreeRef> = Vec::new();
    let mut channels: Vec<AnimationLayerStackChannel> = Vec::new();
    let mut channel_by_target: Vec<(TargetRef, usize)> = Vec::new();
    let mut state_machines: Vec<AnimationStateMachineRef> = Vec::new();
    let mut sample_width: usize = 0;

    for layer_index in 0..copied_layers.len() {
        let layer = &copied_layers[layer_index];
        if let Some(ref bt) = layer.blend_tree {
            if !blend_trees.iter().any(|t| Arc::ptr_eq(t, bt)) {
                blend_trees.push(bt.clone());
            }
        } else if let Some(ref sm) = layer.state_machine {
            if !state_machines.iter().any(|s| Arc::ptr_eq(s, sm)) {
                state_machines.push(sm.clone());
            }
        }

        let source_channels = get_animation_layer_channels(layer);
        let channel_indices: Vec<usize> = match &layer.channel_indices {
            Some(indices) => indices.clone(),
            None => (0..source_channels.len()).collect(),
        };

        for &channel_index in &channel_indices {
            let channel = &source_channels[channel_index];
            sample_width = sample_width.max(channel.track.read().unwrap().components);
            let existing_index = channel_by_target
                .iter()
                .find(|(t, _)| flight_entity::unknown_same_value_zero(t, &channel.target_ref))
                .map(|(_, i)| *i);
            if existing_index.is_none() {
                channel_by_target.push((channel.target_ref.clone(), channels.len()));
                channels.push(AnimationLayerStackChannel {
                    channel: channel.clone(),
                    sources: vec![AnimationLayerStackChannelSource {
                        channel_index,
                        layer_index,
                    }],
                });
                continue;
            }
            let idx = existing_index.unwrap();
            assert_compatible_animation_layer_channels(&channels[idx].channel, channel);
            channels[idx]
                .sources
                .push(AnimationLayerStackChannelSource {
                    channel_index,
                    layer_index,
                });
        }
    }
    out.advance_scratch = Vec::new();
    out.blend_trees = blend_trees;
    out.channels = channels;
    out.layers = copied_layers;
    out.sample_scratch = vec![0.0; sample_width];
    out.state_machines = state_machines;
}

pub fn advance_animation_layer_stack(stack: &mut AnimationLayerStack, dt: f32) {
    let mut advanced: Vec<AnimationPlayerRef> = Vec::new();
    std::mem::swap(&mut stack.advance_scratch, &mut advanced);
    advanced.clear();

    for tree_ref in &stack.blend_trees {
        let tree = tree_ref.read().unwrap();
        advance_animation_players(&tree.players, dt, &mut advanced);
    }
    for machine_ref in &stack.state_machines {
        let mut machine = machine_ref.write().unwrap();
        advance_animation_state_machine_with_scratch(&mut machine, dt, &mut advanced);
    }

    stack.advance_scratch = advanced;
}

fn assert_compatible_animation_layer_channels(
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
    if existing_components != components || existing_quaternion != quaternion {
        panic!("AnimationLayerStack target has incompatible tracks across layers.");
    }
}

fn copy_animation_layer_channel_indices(
    channel_indices: Option<&Vec<usize>>,
    channel_count: usize,
) -> Option<Vec<usize>> {
    let indices = match channel_indices {
        None => return None,
        Some(i) => i,
    };
    let mut copied: Vec<usize> = indices.clone();
    copied.sort();
    for index in 0..copied.len() {
        let channel_index = copied[index];
        if channel_index >= channel_count {
            panic!(
                "AnimationLayer channel index {} does not exist.",
                channel_index
            );
        }
        if index > 0 && copied[index - 1] == channel_index {
            panic!(
                "AnimationLayer channel index {} is duplicated.",
                channel_index
            );
        }
    }
    return Some(copied);
}

fn copy_animation_layer_sample(out: &mut [f32], sample: &[f32], components: usize) {
    let width = out.len().min(sample.len()).min(components);
    for component in 0..width {
        out[component] = sample[component];
    }
}

fn get_animation_layer_channels(layer: &AnimationLayer) -> Vec<AnimationChannel> {
    if let Some(ref bt) = layer.blend_tree {
        let tree = bt.read().unwrap();
        return tree.channels.iter().map(|c| c.channel.clone()).collect();
    }
    if let Some(ref sm) = layer.state_machine {
        let machine = sm.read().unwrap();
        return machine.channels.iter().map(|c| c.channel.clone()).collect();
    }
    return Vec::new();
}

fn sample_animation_layer(out: &mut [f32], layer: &AnimationLayer, channel_index: usize) -> bool {
    if let Some(ref bt) = layer.blend_tree {
        return sample_animation_blend_tree_channel(out, &mut bt.write().unwrap(), channel_index);
    }
    if let Some(ref sm) = layer.state_machine {
        return sample_animation_state_machine_channel(
            out,
            &mut sm.write().unwrap(),
            channel_index,
        );
    }
    return false;
}

pub fn sample_animation_layer_stack(
    out: &mut [f32],
    stack: &mut AnimationLayerStack,
    visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
) {
    for index in 0..stack.channels.len() {
        let sampled = sample_animation_layer_stack_channel(out, stack, index);
        if sampled {
            let channel = stack.channels[index].channel.clone();
            visit(out, &channel, index);
        }
    }
}

pub fn sample_animation_layer_stack_channel(
    out: &mut [f32],
    stack: &mut AnimationLayerStack,
    channel_index: usize,
) -> bool {
    if channel_index >= stack.channels.len() {
        return false;
    }

    let mut has_pose = false;
    let sources: Vec<AnimationLayerStackChannelSource> =
        stack.channels[channel_index].sources.clone();

    for source in &sources {
        let layer = &stack.layers[source.layer_index];
        if !(layer.weight > 0.0) {
            continue;
        }
        let sampled =
            sample_animation_layer(&mut stack.sample_scratch, layer, source.channel_index);
        if !sampled {
            continue;
        }
        let (components, quaternion) = {
            let track = stack.channels[channel_index].channel.track.read().unwrap();
            (track.components, track.quaternion)
        };
        let layer_weight = layer.weight;
        let layer_additive = layer.additive;

        if layer_additive {
            if !has_pose {
                write_animation_layer_identity(out, components, quaternion);
                has_pose = true;
            }
            let scratch_copy: Vec<f32> = stack.sample_scratch.clone();
            let out_copy: Vec<f32> = out[..components.min(out.len())].to_vec();
            add_animation_sample(out, &out_copy, &scratch_copy, layer_weight, quaternion);
        } else if has_pose {
            let scratch_copy: Vec<f32> = stack.sample_scratch.clone();
            let out_copy: Vec<f32> = out[..components.min(out.len())].to_vec();
            blend_animation_samples(out, &out_copy, &scratch_copy, layer_weight, quaternion);
        } else {
            copy_animation_layer_sample(out, &stack.sample_scratch, components);
            has_pose = true;
        }
    }
    return has_pose;
}

pub fn set_animation_layer_weight(
    stack: &mut AnimationLayerStack,
    layer_index: usize,
    weight: f32,
) -> bool {
    if layer_index >= stack.layers.len() {
        return false;
    }
    stack.layers[layer_index].weight = weight;
    return true;
}

fn write_animation_layer_identity(out: &mut [f32], components: usize, quaternion: bool) {
    let width = out.len().min(components);
    for component in 0..width {
        out[component] = 0.0;
    }
    if quaternion && width >= 4 {
        out[3] = 1.0;
    }
}
