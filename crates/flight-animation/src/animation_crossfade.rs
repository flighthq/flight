use std::collections::HashSet;

use crate::animation_blend::blend_animation_samples;
use crate::animation_player::advance_animation_player;
use crate::animation_track::sample_animation_track_ref;
use crate::types::*;

pub fn create_animation_crossfade(
    from: AnimationPlayerRef,
    to: AnimationPlayerRef,
    duration: f32,
    opts: Option<&AnimationCrossfadeOptions>,
) -> AnimationCrossfade {
    let mut out = AnimationCrossfade::default();
    initialize_animation_crossfade(&mut out, from, to, duration, opts);
    return out;
}

fn create_animation_crossfade_channels(
    from: &AnimationPlayerRef,
    to: &AnimationPlayerRef,
) -> Vec<AnimationCrossfadeChannel> {
    let from_player = from.read().unwrap();
    let to_player = to.read().unwrap();
    let from_clip = from_player.clip.read().unwrap();
    let to_clip = to_player.clip.read().unwrap();
    let from_channels = &from_clip.channels;
    let to_channels = &to_clip.channels;

    assert_unique_animation_crossfade_targets(from_channels, "source");
    assert_unique_animation_crossfade_targets(to_channels, "destination");

    let mut to_by_target: Vec<(TargetRef, usize)> = Vec::new();
    for index in 0..to_channels.len() {
        if !to_by_target
            .iter()
            .any(|(t, _)| flight_entity::unknown_same_value_zero(t, &to_channels[index].target_ref))
        {
            to_by_target.push((to_channels[index].target_ref.clone(), index));
        }
    }

    let mut channels: Vec<AnimationCrossfadeChannel> = Vec::new();
    let mut matched_to: HashSet<usize> = HashSet::new();

    for from_index in 0..from_channels.len() {
        let from_channel = &from_channels[from_index];
        let to_index = to_by_target
            .iter()
            .find(|(t, _)| flight_entity::unknown_same_value_zero(t, &from_channel.target_ref))
            .map(|(_, i)| *i);
        if to_index.is_none() {
            channels.push(AnimationCrossfadeChannel {
                channel: from_channel.clone(),
                from_index: Some(from_index),
                to_index: None,
            });
            continue;
        }
        let to_idx = to_index.unwrap();
        let to_channel = &to_channels[to_idx];
        let (from_components, from_quaternion) = {
            let track = from_channel.track.read().unwrap();
            (track.components, track.quaternion)
        };
        let (to_components, to_quaternion) = {
            let track = to_channel.track.read().unwrap();
            (track.components, track.quaternion)
        };
        if from_components != to_components {
            panic!(
                "AnimationCrossfade target has different component widths ({} and {}).",
                from_components, to_components
            );
        }
        if from_quaternion != to_quaternion {
            panic!("AnimationCrossfade target has incompatible quaternion flags.");
        }
        channels.push(AnimationCrossfadeChannel {
            channel: to_channel.clone(),
            from_index: Some(from_index),
            to_index: Some(to_idx),
        });
        matched_to.insert(to_idx);
    }

    for to_index in 0..to_channels.len() {
        if !matched_to.contains(&to_index) {
            channels.push(AnimationCrossfadeChannel {
                channel: to_channels[to_index].clone(),
                from_index: None,
                to_index: Some(to_index),
            });
        }
    }

    return channels;
}

pub fn initialize_animation_crossfade(
    out: &mut AnimationCrossfade,
    from: AnimationPlayerRef,
    to: AnimationPlayerRef,
    duration: f32,
    opts: Option<&AnimationCrossfadeOptions>,
) {
    let resolved_duration = f32::max(0.0, duration);
    let curve = opts
        .and_then(|o| o.curve)
        .unwrap_or(linear_animation_crossfade_curve);
    let channels = create_animation_crossfade_channels(&from, &to);
    let mut sample_width: usize = 0;
    for entry in &channels {
        sample_width = sample_width.max(entry.channel.track.read().unwrap().components);
    }
    out.channels = channels;
    out.curve = curve;
    out.duration = resolved_duration;
    out.elapsed = 0.0;
    out.from = from;
    out.from_sample = vec![0.0; sample_width];
    out.to = to;
    out.to_sample = vec![0.0; sample_width];
    out.weight = curve(get_linear_animation_crossfade_weight(
        0.0,
        resolved_duration,
    ));
}

pub fn advance_animation_crossfade(state: &mut AnimationCrossfade, dt: f32) {
    advance_animation_player(&mut state.from.write().unwrap(), dt);
    advance_animation_player(&mut state.to.write().unwrap(), dt);
    state.elapsed += dt;
    state.weight = (state.curve)(get_linear_animation_crossfade_weight(
        state.elapsed,
        state.duration,
    ));
}

fn assert_unique_animation_crossfade_targets(channels: &[AnimationChannel], clip_label: &str) {
    let mut targets: Vec<TargetRef> = Vec::new();
    for channel in channels {
        if targets
            .iter()
            .any(|t| flight_entity::unknown_same_value_zero(t, &channel.target_ref))
        {
            panic!(
                "AnimationCrossfade {} clip contains a duplicate targetRef.",
                clip_label
            );
        }
        targets.push(channel.target_ref.clone());
    }
}

fn get_linear_animation_crossfade_weight(elapsed: f32, duration: f32) -> f32 {
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

pub fn is_animation_crossfade_complete(state: &AnimationCrossfade) -> bool {
    return state.duration <= 0.0 || state.elapsed >= state.duration;
}

fn linear_animation_crossfade_curve(t: f32) -> f32 {
    return t;
}

pub fn sample_animation_crossfade(
    out: &mut [f32],
    state: &mut AnimationCrossfade,
    visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
) {
    let from_player = state.from.read().unwrap();
    let to_player = state.to.read().unwrap();
    let from_clip = from_player.clip.read().unwrap();
    let to_clip = to_player.clip.read().unwrap();
    let from_channels = &from_clip.channels;
    let to_channels = &to_clip.channels;

    for index in 0..state.channels.len() {
        let entry = &state.channels[index];
        if entry.from_index.is_none() {
            let to_idx = entry.to_index.unwrap();
            sample_animation_track_ref(out, &to_channels[to_idx].track, to_player.time);
        } else if entry.to_index.is_none() {
            let from_idx = entry.from_index.unwrap();
            sample_animation_track_ref(out, &from_channels[from_idx].track, from_player.time);
        } else {
            let from_idx = entry.from_index.unwrap();
            let to_idx = entry.to_index.unwrap();
            let from_track = &from_channels[from_idx].track;
            let to_track = &to_channels[to_idx].track;
            sample_animation_track_ref(&mut state.from_sample, from_track, from_player.time);
            sample_animation_track_ref(&mut state.to_sample, to_track, to_player.time);
            let from_sample_copy: Vec<f32> = state.from_sample.clone();
            let to_sample_copy: Vec<f32> = state.to_sample.clone();
            blend_animation_samples(
                out,
                &from_sample_copy,
                &to_sample_copy,
                state.weight,
                from_track.read().unwrap().quaternion,
            );
        }
        let channel = state.channels[index].channel.clone();
        visit(out, &channel, index);
    }
}
