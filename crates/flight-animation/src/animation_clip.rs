use crate::animation_track::{clone_animation_track, sample_animation_track};
use crate::types::*;

pub fn create_animation_channel(track: AnimationTrack, target_ref: TargetRef) -> AnimationChannel {
    let mut out = AnimationChannel::default();
    initialize_animation_channel(&mut out, track, target_ref);
    return out;
}

pub fn create_animation_clip(
    channels: Vec<AnimationChannel>,
    duration: Option<f32>,
    events: &[AnimationClipEvent],
) -> AnimationClip {
    let mut out = AnimationClip::default();
    initialize_animation_clip(&mut out, channels, duration, events);
    return out;
}

pub fn create_animation_clip_event(time: f32, name: &str, payload: Payload) -> AnimationClipEvent {
    let mut out = AnimationClipEvent::default();
    initialize_animation_clip_event(&mut out, time, name, payload);
    return out;
}

pub fn initialize_animation_channel(
    out: &mut AnimationChannel,
    track: AnimationTrack,
    target_ref: TargetRef,
) {
    out.target_ref = target_ref;
    out.track = track;
}

pub fn initialize_animation_clip(
    out: &mut AnimationClip,
    channels: Vec<AnimationChannel>,
    duration: Option<f32>,
    events: &[AnimationClipEvent],
) {
    let mut copied_events: Vec<AnimationClipEvent> = events.to_vec();
    copied_events.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    validate_animation_clip_events(&copied_events);

    let computed_duration = f32::max(
        compute_channels_duration(&channels),
        compute_animation_clip_events_duration(&copied_events),
    );

    if let Some(d) = duration {
        if !copied_events.is_empty() && copied_events[copied_events.len() - 1].time > d {
            panic!("AnimationClip event time exceeds the explicit clip duration.");
        }
    }

    out.channels = channels;
    out.duration = duration.unwrap_or(computed_duration);
    out.events = copied_events;
}

pub fn initialize_animation_clip_event(
    out: &mut AnimationClipEvent,
    time: f32,
    name: &str,
    payload: Payload,
) {
    out.name = name.to_string();
    out.payload = payload;
    out.time = time;
}

pub fn clone_animation_clip(clip: &AnimationClip) -> AnimationClip {
    let mut channels: Vec<AnimationChannel> = Vec::new();
    for channel in &clip.channels {
        channels.push(create_animation_channel(
            clone_animation_track(&channel.track),
            channel.target_ref,
        ));
    }
    let events: Vec<AnimationClipEvent> = clip
        .events
        .iter()
        .map(|event| create_animation_clip_event(event.time, &event.name, event.payload))
        .collect();
    return create_animation_clip(channels, Some(clip.duration), &events);
}

fn compute_animation_clip_events_duration(events: &[AnimationClipEvent]) -> f32 {
    if events.is_empty() {
        return 0.0;
    }
    return events[events.len() - 1].time;
}

fn compute_channels_duration(channels: &[AnimationChannel]) -> f32 {
    let mut max: f32 = 0.0;
    for channel in channels {
        let times = &channel.track.times;
        let last = times.len();
        if last > 0 && times[last - 1] > max {
            max = times[last - 1];
        }
    }
    return max;
}

pub fn get_animation_clip_duration(clip: &AnimationClip) -> f32 {
    return clip.duration;
}

pub fn sample_animation_clip(
    out: &mut [f32],
    clip: &AnimationClip,
    time: f32,
    visit: &mut dyn FnMut(&[f32], &AnimationChannel, usize),
) {
    let channels = &clip.channels;
    for i in 0..channels.len() {
        let channel = &channels[i];
        sample_animation_track(out, &channel.track, time);
        visit(out, channel, i);
    }
}

fn validate_animation_clip_events(events: &[AnimationClipEvent]) {
    for event in events {
        if !event.time.is_finite() || event.time < 0.0 {
            panic!(
                "AnimationClip event \"{}\" time must be a finite non-negative number.",
                event.name
            );
        }
    }
}
