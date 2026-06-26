use flighthq_types::{AnimationChannel, AnimationClip, AnimationTrack};

// Pairs a track with an opaque target reference (interpreted only by the domain binding layer).
// Pass `None` for an unbound channel; pass `Some(boxed_value)` to bind to a concrete target.
pub fn create_animation_channel(
    track: AnimationTrack,
    target_ref: Option<Box<dyn std::any::Any + Send + Sync>>,
) -> AnimationChannel {
    AnimationChannel { target_ref, track }
}

// Bundles channels into a clip. `duration` defaults to the latest keyframe time across all channels.
pub fn create_animation_clip(
    channels: Vec<AnimationChannel>,
    duration: Option<f32>,
) -> AnimationClip {
    let d = duration.unwrap_or_else(|| compute_channels_duration(&channels));
    AnimationClip {
        channels,
        duration: d,
    }
}

// Returns the clip's total duration in seconds.
pub fn get_animation_clip_duration(clip: &AnimationClip) -> f32 {
    clip.duration
}

fn compute_channels_duration(channels: &[AnimationChannel]) -> f32 {
    let mut max = 0.0f32;
    for channel in channels {
        let times = &channel.track.times;
        if let Some(&last) = times.last() {
            if last > max {
                max = last;
            }
        }
    }
    max
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::animation_track::{AnimationTrackOpts, create_animation_track};

    fn make_track(times: Vec<f32>) -> AnimationTrack {
        let values = vec![0.0f32; times.len()];
        create_animation_track(AnimationTrackOpts {
            times,
            values,
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
        })
    }

    #[test]
    fn create_animation_channel_pairs_track_with_target_ref() {
        let track = make_track(vec![0.0, 1.0]);
        let channel = create_animation_channel(
            track,
            Some(Box::new(42u32) as Box<dyn std::any::Any + Send + Sync>),
        );
        assert_eq!(channel.track.times, vec![0.0, 1.0]);
        let val = channel
            .target_ref
            .as_ref()
            .and_then(|r| r.downcast_ref::<u32>())
            .copied();
        assert_eq!(val, Some(42));
    }

    #[test]
    fn create_animation_clip_derives_duration_from_latest_keyframe() {
        let clip = create_animation_clip(
            vec![
                create_animation_channel(make_track(vec![0.0, 1.0]), None),
                create_animation_channel(make_track(vec![0.0, 2.5]), None),
            ],
            None,
        );
        assert!((clip.duration - 2.5).abs() < 1e-6);
    }

    #[test]
    fn create_animation_clip_honors_explicit_duration_override() {
        let clip = create_animation_clip(
            vec![create_animation_channel(make_track(vec![0.0, 1.0]), None)],
            Some(10.0),
        );
        assert!((clip.duration - 10.0).abs() < 1e-6);
    }

    #[test]
    fn get_animation_clip_duration_returns_clip_duration() {
        let clip = create_animation_clip(vec![], Some(4.0));
        assert!((get_animation_clip_duration(&clip) - 4.0).abs() < 1e-6);
    }
}
