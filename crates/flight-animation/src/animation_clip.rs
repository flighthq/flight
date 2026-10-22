use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};

use crate::animation_track::{clone_animation_track, sample_animation_track_ref};
use crate::types::*;

pub fn create_animation_channel(
    track: &Ref<AnimationTrack>,
    target_ref: TargetRef,
) -> AnimationChannel {
    // Built directly so no placeholder track is allocated (Principal c0f9227c).
    return AnimationChannel {
        track: track.clone(),
        target_ref,
        runtime: EntityRuntimeSlot::default(),
    };
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

/// Creates a clip event at time 0 with an empty name and no payload (TS `createAnimationClipEvent`);
/// its fields are assigned after creation (D23 B).
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign time, name and payload after create
pub fn create_animation_clip_event() -> AnimationClipEvent {
    let mut out = AnimationClipEvent::default();
    initialize_animation_clip_event(&mut out);
    return out;
}

pub fn initialize_animation_channel(
    out: &mut AnimationChannel,
    track: &Ref<AnimationTrack>,
    target_ref: TargetRef,
) {
    out.target_ref = target_ref;
    out.track = track.clone();
}

pub fn initialize_animation_clip(
    out: &mut AnimationClip,
    channels: Vec<AnimationChannel>,
    duration: Option<f32>,
    events: &[AnimationClipEvent],
) {
    let mut copied_events: Vec<AnimationClipEvent> = events.to_vec();
    copied_events.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
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

/// Constructs a clip event's fields in place (TS `initializeAnimationClipEvent`).
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
pub fn initialize_animation_clip_event(out: &mut AnimationClipEvent) {
    out.name = String::new();
    out.payload = 0;
    out.time = 0.0;
}

pub fn clone_animation_clip(clip: &AnimationClip) -> AnimationClip {
    let mut channels: Vec<AnimationChannel> = Vec::new();
    for channel in &clip.channels {
        let cloned_track = {
            let track = channel.track.read().unwrap();
            Arc::new(RwLock::new(clone_animation_track(&track)))
        };
        channels.push(create_animation_channel(
            &cloned_track,
            channel.target_ref.clone(),
        ));
    }
    let events: Vec<AnimationClipEvent> = clip
        .events
        .iter()
        .map(|source| {
            let mut event = create_animation_clip_event();
            event.time = source.time;
            event.name = source.name.clone();
            event.payload = source.payload;
            return event;
        })
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
        let track = channel.track.read().unwrap();
        let times = &track.times;
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
        sample_animation_track_ref(out, &channel.track, time);
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
