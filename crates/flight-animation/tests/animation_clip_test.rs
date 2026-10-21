use flight_animation::*;

fn track(times: Vec<f32>) -> AnimationTrack {
    let values: Vec<f32> = times.iter().map(|_| 0.0).collect();
    return create_animation_track(CreateAnimationTrackOpts {
        times,
        values,
        components: None,
        interpolation: None,
        quaternion: None,
        easing: None,
        segment_easings: None,
    });
}

mod clone_animation_clip {
    use super::*;

    #[test]
    fn deep_copies_tracks_and_event_descriptors_but_shares_opaque_references() {
        let target: usize = 1;
        let payload: usize = 42;
        let clip = create_animation_clip(
            vec![create_animation_channel(track(vec![0.0, 1.0]), target)],
            None,
            &[create_animation_clip_event(0.5, "step", payload)],
        );
        let cloned = clone_animation_clip(&clip);
        assert_ne!(
            cloned.channels[0].track.times.as_ptr(),
            clip.channels[0].track.times.as_ptr()
        );
        assert_eq!(cloned.channels[0].target_ref, target);
        assert_eq!(cloned.events[0].payload, payload);
        assert_eq!(cloned.duration, clip.duration);
    }
}

mod create_animation_channel {
    use super::*;

    #[test]
    fn pairs_a_track_with_an_opaque_target_ref() {
        let t = track(vec![0.0, 1.0]);
        let target: usize = 1;
        let channel = create_animation_channel(t, target);
        assert_eq!(channel.target_ref, target);
    }
}

mod create_animation_clip {
    use super::*;

    #[test]
    fn derives_duration_from_the_latest_keyframe_across_channels() {
        let clip = create_animation_clip(
            vec![
                create_animation_channel(track(vec![0.0, 1.0]), 0),
                create_animation_channel(track(vec![0.0, 2.5]), 0),
            ],
            None,
            &[],
        );
        assert_eq!(clip.duration, 2.5);
    }

    #[test]
    fn honors_an_explicit_duration_override() {
        let clip = create_animation_clip(
            vec![create_animation_channel(track(vec![0.0, 1.0]), 0)],
            Some(10.0),
            &[],
        );
        assert_eq!(clip.duration, 10.0);
    }

    #[test]
    fn copies_and_sorts_events_and_includes_their_latest_time_in_derived_duration() {
        let late = create_animation_clip_event(3.0, "late", 0);
        let early = create_animation_clip_event(1.0, "early", 0);
        let clip = create_animation_clip(vec![], None, &[late, early]);
        assert_eq!(clip.events[0].name, "early");
        assert_eq!(clip.events[1].name, "late");
        assert_eq!(clip.duration, 3.0);
    }

    #[test]
    #[should_panic(expected = "finite non-negative")]
    fn rejects_negative_event_times() {
        create_animation_clip(
            vec![],
            None,
            &[create_animation_clip_event(-1.0, "bad", 0)],
        );
    }

    #[test]
    #[should_panic(expected = "exceeds")]
    fn rejects_unreachable_event_times() {
        create_animation_clip(
            vec![],
            Some(1.0),
            &[create_animation_clip_event(2.0, "late", 0)],
        );
    }
}

mod create_animation_clip_event {
    use super::*;

    #[test]
    fn creates_an_event_with_opaque_payload() {
        let payload: usize = 42;
        let event = create_animation_clip_event(0.5, "step", payload);
        assert_eq!(event.name, "step");
        assert_eq!(event.payload, payload);
        assert_eq!(event.time, 0.5);
    }
}

mod get_animation_clip_duration {
    use super::*;

    #[test]
    fn returns_the_clip_duration() {
        let clip = create_animation_clip(vec![], Some(4.0), &[]);
        assert_eq!(get_animation_clip_duration(&clip), 4.0);
    }
}

mod initialize_animation_channel {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_animation_channel() {
        let _ = initialize_animation_channel as fn(&mut AnimationChannel, AnimationTrack, usize);
    }
}

mod initialize_animation_clip {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_animation_clip() {
        let _ = initialize_animation_clip
            as fn(&mut AnimationClip, Vec<AnimationChannel>, Option<f32>, &[AnimationClipEvent]);
    }
}

mod initialize_animation_clip_event {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_animation_clip_event() {
        let _ = initialize_animation_clip_event as fn(&mut AnimationClipEvent, f32, &str, usize);
    }
}

mod sample_animation_clip {
    use super::*;

    #[test]
    fn samples_every_channel_at_the_given_time_and_visits_each() {
        let a = create_animation_track(CreateAnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![0.0, 10.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        });
        let b = create_animation_track(CreateAnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: vec![100.0, 200.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        });
        let target_a: usize = 1;
        let target_b: usize = 2;
        let clip = create_animation_clip(
            vec![
                create_animation_channel(a, target_a),
                create_animation_channel(b, target_b),
            ],
            None,
            &[],
        );
        let mut out = [0.0];
        let mut seen: Vec<(usize, usize, f32)> = Vec::new();
        sample_animation_clip(&mut out, &clip, 0.5, &mut |sampled, channel, index| {
            seen.push((index, channel.target_ref, sampled[0]));
        });
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0], (0, target_a, 5.0));
        assert_eq!(seen[1], (1, target_b, 150.0));
    }

    #[test]
    fn does_not_invoke_the_visitor_for_a_channel_less_clip() {
        let clip = create_animation_clip(vec![], Some(1.0), &[]);
        let mut calls = 0;
        sample_animation_clip(&mut [0.0], &clip, 0.0, &mut |_, _, _| {
            calls += 1;
        });
        assert_eq!(calls, 0);
    }
}
