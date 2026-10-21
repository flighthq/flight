use std::sync::{Arc, RwLock};

use flight_animation::contract::*;
use flight_animation::*;

fn player(
    target: TargetRef,
    values: &[f32],
    components: Option<usize>,
    quaternion: Option<bool>,
) -> AnimationPlayerRef {
    let track = Arc::new(RwLock::new(create_animation_track(
        CreateAnimationTrackOpts {
            times: vec![0.0, 1.0],
            values: values.to_vec(),
            components,
            quaternion,
            interpolation: None,
            easing: None,
            segment_easings: None,
        },
    )));
    let clip = create_animation_clip(vec![create_animation_channel(&track, target)], None, &[]);
    return Arc::new(RwLock::new(create_animation_player(clip, None)));
}

fn scalar_player(target: TargetRef, values: &[f32]) -> AnimationPlayerRef {
    return player(target, values, None, None);
}

fn test_target() -> TargetRef {
    return Some(Arc::new(0_usize));
}

mod advance_animation_crossfade {
    use super::*;

    #[test]
    fn advances_both_players_by_the_same_delta_and_updates_linear_weight() {
        let target = test_target();
        let from = scalar_player(target.clone(), &[0.0, 10.0]);
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
        let target = test_target();
        fn square(t: f32) -> f32 {
            return t * t;
        }
        let mut state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 1.0]),
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
        let target = test_target();
        let state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 1.0]),
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
        let target = test_target();
        let state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 1.0]),
            scalar_player(target, &[1.0, 2.0]),
            0.0,
            None,
        );
        assert_eq!(state.weight, 1.0);
        assert!(is_animation_crossfade_complete(&state));
    }

    #[test]
    fn matches_reordered_channels_by_target_and_retains_one_sided_channels() {
        let shared = test_target();
        let from_only: TargetRef = Some(Arc::new(1_usize));
        let to_only: TargetRef = Some(Arc::new(2_usize));

        let from_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![1.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
                    shared.clone(),
                ),
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![2.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
                    from_only,
                ),
            ],
            None,
            &[],
        );
        let to_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![3.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
                    to_only,
                ),
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![4.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
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
        let target = test_target();
        let scalar = scalar_player(target.clone(), &[0.0, 1.0]);
        let vector = player(target, &[0.0, 0.0, 1.0, 1.0], Some(2), None);
        create_animation_crossfade(scalar, vector, 1.0, None);
    }

    #[test]
    #[should_panic(expected = "incompatible quaternion flags")]
    fn rejects_incompatible_quaternion_flags() {
        let target = test_target();
        let quat = player(
            target.clone(),
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
        let dup = test_target();
        let track = Arc::new(RwLock::new(create_animation_track(
            CreateAnimationTrackOpts {
                times: vec![0.0],
                values: vec![1.0],
                components: None,
                interpolation: None,
                quaternion: None,
                easing: None,
                segment_easings: None,
            },
        )));
        let dup_clip = create_animation_clip(
            vec![
                create_animation_channel(&track, dup.clone()),
                create_animation_channel(&track, dup.clone()),
            ],
            None,
            &[],
        );
        let unique_clip =
            create_animation_clip(vec![create_animation_channel(&track, dup)], None, &[]);
        let dup_player = Arc::new(RwLock::new(create_animation_player(dup_clip, None)));
        let unique_player = Arc::new(RwLock::new(create_animation_player(unique_clip, None)));
        create_animation_crossfade(dup_player, unique_player, 1.0, None);
    }

    #[test]
    #[should_panic(expected = "duplicate targetRef")]
    fn rejects_duplicate_nan_targets_in_source_clip() {
        let nan_target: TargetRef = Some(Arc::new(f64::NAN));
        let track = Arc::new(RwLock::new(create_animation_track(CreateAnimationTrackOpts {
            times: vec![0.0],
            values: vec![1.0],
            components: None,
            interpolation: None,
            quaternion: None,
            easing: None,
            segment_easings: None,
        })));
        let dup_clip = create_animation_clip(
            vec![
                create_animation_channel(&track, nan_target.clone()),
                create_animation_channel(&track, nan_target),
            ],
            None,
            &[],
        );
        let unique_target: TargetRef = Some(Arc::new(f64::NAN));
        let unique_clip = create_animation_clip(
            vec![create_animation_channel(&track, unique_target)],
            None,
            &[],
        );
        let dup_player = Arc::new(RwLock::new(create_animation_player(dup_clip, None)));
        let unique_player = Arc::new(RwLock::new(create_animation_player(unique_clip, None)));
        create_animation_crossfade(dup_player, unique_player, 1.0, None);
    }

    #[test]
    fn matches_nan_targets_across_source_and_destination_clips() {
        let from_nan: TargetRef = Some(Arc::new(f64::NAN));
        let to_nan: TargetRef = Some(Arc::new(f64::NAN));
        let from = scalar_player(from_nan, &[0.0, 10.0]);
        let to = scalar_player(to_nan, &[20.0, 30.0]);
        let state = create_animation_crossfade(from, to, 1.0, None);
        assert_eq!(state.channels.len(), 1);
        assert!(state.channels[0].from_index.is_some());
        assert!(state.channels[0].to_index.is_some());
    }

    #[test]
    fn keeps_distinct_opaque_object_targets_as_separate_channels() {
        struct OpaqueTarget;
        let from_obj: TargetRef = Some(Arc::new(OpaqueTarget));
        let to_obj: TargetRef = Some(Arc::new(OpaqueTarget));
        let from = scalar_player(from_obj, &[0.0, 10.0]);
        let to = scalar_player(to_obj, &[20.0, 30.0]);
        let state = create_animation_crossfade(from, to, 1.0, None);
        assert_eq!(state.channels.len(), 2);
        assert!(state.channels[0].from_index.is_some());
        assert!(state.channels[0].to_index.is_none());
        assert!(state.channels[1].from_index.is_none());
        assert!(state.channels[1].to_index.is_some());
    }

    #[test]
    fn matches_nan_from_different_numeric_representations() {
        let from_nan: TargetRef = Some(Arc::new(f32::NAN));
        let to_nan: TargetRef = Some(Arc::new(f64::NAN));
        let from = scalar_player(from_nan, &[0.0, 10.0]);
        let to = scalar_player(to_nan, &[20.0, 30.0]);
        let state = create_animation_crossfade(from, to, 1.0, None);
        assert_eq!(state.channels.len(), 1);
        assert!(state.channels[0].from_index.is_some());
        assert!(state.channels[0].to_index.is_some());
    }
}

mod initialize_animation_crossfade {
    use super::*;

    #[test]
    fn reinitializes_a_crossfade_with_new_players_and_duration() {
        let target = test_target();
        let from = scalar_player(target.clone(), &[0.0, 10.0]);
        let to = scalar_player(target.clone(), &[20.0, 30.0]);
        let mut state = create_animation_crossfade(from, to, 1.0, None);
        let new_from = scalar_player(target.clone(), &[5.0, 15.0]);
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
        let target = test_target();
        let mut state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 1.0]),
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
        let target = test_target();
        fn overshoot(t: f32) -> f32 {
            return 1.0 + t;
        }
        let mut state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 1.0]),
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
        let target = test_target();
        let mut state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 10.0]),
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
        let shared = test_target();
        let from_only: TargetRef = Some(Arc::new(1_usize));
        let to_only: TargetRef = Some(Arc::new(2_usize));
        let from_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![2.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
                    shared.clone(),
                ),
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![7.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
                    from_only,
                ),
            ],
            None,
            &[],
        );
        let to_clip = create_animation_clip(
            vec![
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![9.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
                    to_only,
                ),
                create_animation_channel(
                    &Arc::new(RwLock::new(create_animation_track(
                        CreateAnimationTrackOpts {
                            times: vec![0.0],
                            values: vec![6.0],
                            components: None,
                            interpolation: None,
                            quaternion: None,
                            easing: None,
                            segment_easings: None,
                        },
                    ))),
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
        let mut seen: Vec<(usize, f32)> = Vec::new();
        sample_animation_crossfade(&mut [0.0], &mut state, &mut |sampled, _channel, index| {
            seen.push((index, sampled[0]));
        });
        assert_eq!(seen.len(), 3);
        assert_eq!(seen[0], (0, 4.0));
        assert_eq!(seen[1], (1, 7.0));
        assert_eq!(seen[2], (2, 9.0));
    }

    #[test]
    fn preserves_alpha_endpoints() {
        let target = test_target();
        let mut state = create_animation_crossfade(
            scalar_player(target.clone(), &[0.0, 10.0]),
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
        let target = test_target();
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;
        let from = player(
            target.clone(),
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
        sample_animation_crossfade(
            &mut [0.0, 0.0, 0.0, 0.0],
            &mut state,
            &mut |sampled, _, _| {
                assert!((sampled[2].abs() - sqrt1_2).abs() < 1e-5);
                assert!((sampled[3].abs() - sqrt1_2).abs() < 1e-5);
            },
        );
    }

    #[test]
    fn blends_nan_targeted_channels_across_source_and_destination() {
        let from_nan: TargetRef = Some(Arc::new(f64::NAN));
        let to_nan: TargetRef = Some(Arc::new(f64::NAN));
        let mut state = create_animation_crossfade(
            scalar_player(from_nan, &[0.0, 10.0]),
            scalar_player(to_nan, &[20.0, 40.0]),
            2.0,
            None,
        );
        advance_animation_crossfade(&mut state, 0.5);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_crossfade(&mut [0.0], &mut state, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0], 11.25);
    }
}
