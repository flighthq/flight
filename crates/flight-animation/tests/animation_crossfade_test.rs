use std::sync::{Arc, RwLock};

use flight_animation::*;

fn player(
    target: TargetRef,
    values: &[f32],
    components: Option<usize>,
    quaternion: Option<bool>,
) -> AnimationPlayerRef {
    let track = create_animation_track(CreateAnimationTrackOpts {
        times: vec![0.0, 1.0],
        values: values.to_vec(),
        components,
        quaternion,
        interpolation: None,
        easing: None,
        segment_easings: None,
    });
    let clip = create_animation_clip(
        vec![create_animation_channel(track, target)],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip, None)));
}

fn scalar_player(target: TargetRef, values: &[f32]) -> AnimationPlayerRef {
    return player(target, values, None, None);
}

mod advance_animation_crossfade {
    use super::*;

    #[test]
    fn advances_both_players_by_the_same_delta_and_updates_linear_weight() {
        let target: TargetRef = 1;
        let from = scalar_player(target, &[0.0, 10.0]);
        let to = scalar_player(target, &[20.0, 30.0]);
        let mut state = create_animation_crossfade(from.clone(), to.clone(), 2.0, None);
        advance_animation_crossfade(&mut state, 0.5);
        assert_eq!(from.read().unwrap().time, 0.5);
        assert_eq!(to.read().unwrap().time, 0.5);
        assert_eq!(state.elapsed, 0.5);
        assert_eq!(state.weight, 0.25);
    }

    #[test]
    fn applies_a_caller_provided_curve_to_clamped_normalized_time() {
        let target: TargetRef = 1;
        fn square(t: f32) -> f32 {
            return t * t;
        }
        let mut state = create_animation_crossfade(
            scalar_player(target, &[0.0, 1.0]),
            scalar_player(target, &[1.0, 2.0]),
            1.0,
            Some(&AnimationCrossfadeOptions {
                curve: Some(square),
            }),
        );
        advance_animation_crossfade(&mut state, 0.5);
        assert_eq!(state.weight, 0.25);
        advance_animation_crossfade(&mut state, 2.0);
        assert_eq!(state.weight, 1.0);
    }
}

mod create_animation_crossfade {
    use super::*;

    #[test]
    fn creates_with_linear_weight_and_reusable_scratch_by_default() {
        let target: TargetRef = 1;
        let state = create_animation_crossfade(
            scalar_player(target, &[0.0, 1.0]),
            scalar_player(target, &[1.0, 2.0]),
            2.0,
            None,
        );
        assert_eq!(state.elapsed, 0.0);
        assert_eq!(state.weight, 0.0);
        assert!(!state.from_sample.is_empty());
        assert!(!state.to_sample.is_empty());
    }

    #[test]
    fn completes_a_zero_duration_transition_immediately() {
        let target: TargetRef = 1;
        let state = create_animation_crossfade(
            scalar_player(target, &[0.0, 1.0]),
            scalar_player(target, &[1.0, 2.0]),
            0.0,
            None,
        );
        assert_eq!(state.weight, 1.0);
        assert!(is_animation_crossfade_complete(&state));
    }

    #[test]
    fn matches_reordered_channels_by_target_and_retains_one_sided_channels() {
        let shared: TargetRef = 1;
        let from_only: TargetRef = 2;
        let to_only: TargetRef = 3;

        let from_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![1.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    shared,
                ),
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![2.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    from_only,
                ),
            ],
            None,
            &[],
        );
        let to_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![3.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    to_only,
                ),
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![4.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    shared,
                ),
            ],
            None,
            &[],
        );
        let from = Arc::new(RwLock::new(create_animation_player(from_clip, None)));
        let to = Arc::new(RwLock::new(create_animation_player(to_clip, None)));
        let state = create_animation_crossfade(from, to, 1.0, None);

        assert_eq!(state.channels.len(), 3);
        assert!(state.channels[0].from_index.is_some());
        assert!(state.channels[0].to_index.is_some());
        assert!(state.channels[1].from_index.is_some());
        assert!(state.channels[1].to_index.is_none());
        assert!(state.channels[2].from_index.is_none());
        assert!(state.channels[2].to_index.is_some());
    }

    #[test]
    #[should_panic(expected = "different component widths")]
    fn rejects_incompatible_tracks_with_different_component_widths() {
        let target: TargetRef = 1;
        let scalar = scalar_player(target, &[0.0, 1.0]);
        let vector = player(target, &[0.0, 0.0, 1.0, 1.0], Some(2), None);
        create_animation_crossfade(scalar, vector, 1.0, None);
    }

    #[test]
    #[should_panic(expected = "incompatible quaternion flags")]
    fn rejects_incompatible_quaternion_flags() {
        let target: TargetRef = 1;
        let quat = player(
            target,
            &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            Some(4),
            Some(true),
        );
        let vec4 = player(
            target,
            &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            Some(4),
            None,
        );
        create_animation_crossfade(quat, vec4, 1.0, None);
    }

    #[test]
    #[should_panic(expected = "duplicate targetRef")]
    fn rejects_duplicate_target_references_in_source_clip() {
        let dup: TargetRef = 1;
        let track = create_animation_track(CreateAnimationTrackOpts {
            times: vec![0.0],
            values: vec![1.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        });
        let dup_clip = create_animation_clip(
            vec![
                create_animation_channel(track.clone(), dup),
                create_animation_channel(track.clone(), dup),
            ],
            None,
            &[],
        );
        let unique_clip = create_animation_clip(
            vec![create_animation_channel(track, dup)],
            None,
            &[],
        );
        let dup_player = Arc::new(RwLock::new(create_animation_player(dup_clip, None)));
        let unique_player = Arc::new(RwLock::new(create_animation_player(unique_clip, None)));
        create_animation_crossfade(dup_player, unique_player, 1.0, None);
    }
}

mod initialize_animation_crossfade {
    use super::*;

    #[test]
    fn reinitializes_a_crossfade_with_new_players_and_duration() {
        let target: TargetRef = 1;
        let from = scalar_player(target, &[0.0, 10.0]);
        let to = scalar_player(target, &[20.0, 30.0]);
        let mut state = create_animation_crossfade(from, to, 1.0, None);
        let new_from = scalar_player(target, &[5.0, 15.0]);
        let new_to = scalar_player(target, &[25.0, 35.0]);
        initialize_animation_crossfade(&mut state, new_from, new_to, 3.0, None);
        assert_eq!(state.duration, 3.0);
        assert_eq!(state.elapsed, 0.0);
    }
}

mod is_animation_crossfade_complete {
    use super::*;

    #[test]
    fn uses_elapsed_duration_as_the_retirement_condition() {
        let target: TargetRef = 1;
        let mut state = create_animation_crossfade(
            scalar_player(target, &[0.0, 1.0]),
            scalar_player(target, &[1.0, 2.0]),
            2.0,
            None,
        );
        assert!(!is_animation_crossfade_complete(&state));
        advance_animation_crossfade(&mut state, 2.0);
        assert!(is_animation_crossfade_complete(&state));
    }

    #[test]
    fn does_not_retire_early_when_an_easing_curve_overshoots_1() {
        let target: TargetRef = 1;
        fn overshoot(t: f32) -> f32 {
            return 1.0 + t;
        }
        let mut state = create_animation_crossfade(
            scalar_player(target, &[0.0, 1.0]),
            scalar_player(target, &[1.0, 2.0]),
            1.0,
            Some(&AnimationCrossfadeOptions {
                curve: Some(overshoot),
            }),
        );
        advance_animation_crossfade(&mut state, 0.7);
        assert!(state.weight > 1.0);
        assert!(!is_animation_crossfade_complete(&state));
        advance_animation_crossfade(&mut state, 0.31);
        assert!(is_animation_crossfade_complete(&state));
    }
}

mod sample_animation_crossfade {
    use super::*;

    #[test]
    fn samples_both_playheads_and_blends_through_a_distinct_output_buffer() {
        let target: TargetRef = 1;
        let mut state = create_animation_crossfade(
            scalar_player(target, &[0.0, 10.0]),
            scalar_player(target, &[20.0, 40.0]),
            2.0,
            None,
        );
        advance_animation_crossfade(&mut state, 0.5);
        let mut out = [0.0];
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_crossfade(&mut out, &mut state, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![11.25]);
    }

    #[test]
    fn visits_matched_and_one_sided_channels_in_stable_target_order() {
        let shared: TargetRef = 1;
        let from_only: TargetRef = 2;
        let to_only: TargetRef = 3;
        let from_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![2.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    shared,
                ),
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![7.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    from_only,
                ),
            ],
            None,
            &[],
        );
        let to_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![9.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    to_only,
                ),
                create_animation_channel(
                    create_animation_track(CreateAnimationTrackOpts {
                        times: vec![0.0],
                        values: vec![6.0],
                        components: None,
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    }),
                    shared,
                ),
            ],
            None,
            &[],
        );
        let from = Arc::new(RwLock::new(create_animation_player(from_clip, None)));
        let to = Arc::new(RwLock::new(create_animation_player(to_clip, None)));
        let mut state = create_animation_crossfade(from, to, 2.0, None);
        advance_animation_crossfade(&mut state, 1.0);
        let mut seen: Vec<(usize, TargetRef, f32)> = Vec::new();
        sample_animation_crossfade(&mut [0.0], &mut state, &mut |sampled, channel, index| {
            seen.push((index, channel.target_ref, sampled[0]));
        });
        assert_eq!(seen.len(), 3);
        assert_eq!(seen[0], (0, shared, 4.0));
        assert_eq!(seen[1], (1, from_only, 7.0));
        assert_eq!(seen[2], (2, to_only, 9.0));
    }

    #[test]
    fn preserves_alpha_endpoints() {
        let target: TargetRef = 1;
        let mut state = create_animation_crossfade(
            scalar_player(target, &[0.0, 10.0]),
            scalar_player(target, &[20.0, 40.0]),
            1.0,
            None,
        );
        let mut values: Vec<f32> = Vec::new();
        sample_animation_crossfade(&mut [0.0], &mut state, &mut |sampled, _, _| {
            values.push(sampled[0]);
        });
        advance_animation_crossfade(&mut state, 2.0);
        sample_animation_crossfade(&mut [0.0], &mut state, &mut |sampled, _, _| {
            values.push(sampled[0]);
        });
        assert_eq!(values, vec![0.0, 20.0]);
    }

    #[test]
    fn uses_shortest_arc_quaternion_slerp() {
        let target: TargetRef = 1;
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;
        let from = player(
            target,
            &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            Some(4),
            Some(true),
        );
        let to = player(
            target,
            &[0.0, 0.0, -1.0, 0.0, 0.0, 0.0, -1.0, 0.0],
            Some(4),
            Some(true),
        );
        let mut state = create_animation_crossfade(from, to, 1.0, None);
        advance_animation_crossfade(&mut state, 0.5);
        sample_animation_crossfade(&mut [0.0, 0.0, 0.0, 0.0], &mut state, &mut |sampled, _, _| {
            assert!((sampled[2].abs() - sqrt1_2).abs() < 1e-5);
            assert!((sampled[3].abs() - sqrt1_2).abs() < 1e-5);
        });
    }
}
