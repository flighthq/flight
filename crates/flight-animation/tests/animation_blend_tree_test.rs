use std::panic::AssertUnwindSafe;
use std::sync::{Arc, RwLock};

use flight_animation::*;
use flight_animation::contract::*;

fn player(target: TargetRef, value: f32, duration: f32) -> AnimationPlayerRef {
    let times = if duration > 0.0 {
        vec![0.0, duration]
    } else {
        vec![0.0]
    };
    let values = if duration > 0.0 {
        vec![value, value + 10.0]
    } else {
        vec![value]
    };
    let clip = create_animation_clip(
        vec![create_animation_channel(
            create_animation_track(CreateAnimationTrackOpts {
                times,
                values,
                components: None,
                interpolation: None,
                quaternion: None,
                easing: None,
                segment_easings: None,
            }),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip, None)));
}

fn quaternion_player(target: TargetRef, values: &[f32]) -> AnimationPlayerRef {
    let clip = create_animation_clip(
        vec![create_animation_channel(
            create_animation_track(CreateAnimationTrackOpts {
                components: Some(4),
                quaternion: Some(true),
                times: vec![0.0],
                values: values.to_vec(),
                interpolation: None,
                easing: None,
                segment_easings: None,
            }),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip, None)));
}

mod advance_animation_blend_tree {
    use super::*;

    #[test]
    fn advances_a_shared_player_only_once() {
        let target: TargetRef = 1;
        let shared = player(target, 0.0, 2.0);
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(shared.clone(), 0.25, false),
            create_animation_blend_tree_input(shared.clone(), 0.75, false),
        ]);
        assert_eq!(tree.players.len(), 1);
        advance_animation_blend_tree(&tree, 0.5);
        assert_eq!(shared.read().unwrap().time, 0.5);
    }
}

mod create_animation_blend_tree {
    use super::*;

    #[test]
    fn creates_with_target_matched_reusable_channels() {
        let target: TargetRef = 1;
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(target, 1.0, 0.0), 1.0, false),
            create_animation_blend_tree_input(player(target, 2.0, 0.0), 1.0, false),
        ]);
        assert_eq!(tree.channels.len(), 1);
        assert_eq!(tree.channels[0].sources.len(), 2);
        assert_eq!(tree.channels[0].sources[0].input_index, 0);
        assert_eq!(tree.channels[0].sources[0].channel_index, 0);
        assert_eq!(tree.channels[0].sources[1].input_index, 1);
        assert_eq!(tree.channels[0].sources[1].channel_index, 0);
    }

    #[test]
    fn rejects_duplicate_and_incompatible_target_channels() {
        let target: TargetRef = 1;
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
                create_animation_channel(track.clone(), target),
                create_animation_channel(track.clone(), target),
            ],
            None,
            &[],
        );
        let duplicate = Arc::new(RwLock::new(create_animation_player(dup_clip, None)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree(&[create_animation_blend_tree_input(
                duplicate,
                1.0,
                false,
            )]);
        }));
        assert!(result.is_err());

        let scalar = player(target, 1.0, 0.0);
        let vector_clip = create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(2),
                    times: vec![0.0],
                    values: vec![1.0, 2.0],
                    interpolation: None,
                    quaternion: None,
                    easing: None,
                    segment_easings: None,
                }),
                target,
            )],
            None,
            &[],
        );
        let vector = Arc::new(RwLock::new(create_animation_player(vector_clip, None)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree(&[
                create_animation_blend_tree_input(scalar, 1.0, false),
                create_animation_blend_tree_input(vector, 1.0, false),
            ]);
        }));
        assert!(result.is_err());
    }
}

mod create_animation_blend_tree_input {
    use super::*;

    #[test]
    fn creates_a_mutable_weighted_leaf_with_override_defaults() {
        let input = create_animation_blend_tree_input(player(1, 1.0, 0.0), 1.0, false);
        assert_eq!(input.weight, 1.0);
        assert!(!input.additive);
    }
}

mod create_animation_blend_tree_ref {
    use super::*;

    #[test]
    fn wraps_the_tree_in_a_shared_ref() {
        let tree_ref = create_animation_blend_tree_ref(&[]);
        assert_eq!(tree_ref.read().unwrap().inputs.len(), 0);
    }
}

mod initialize_animation_blend_tree {
    use super::*;

    #[test]
    fn reinitializes_a_tree_to_match_new_inputs() {
        let mut tree = create_animation_blend_tree(&[]);
        let input = create_animation_blend_tree_input(player(1, 5.0, 0.0), 1.0, false);
        initialize_animation_blend_tree(&mut tree, &[input]);
        assert_eq!(tree.inputs.len(), 1);
    }
}

mod initialize_animation_blend_tree_input {
    use super::*;

    #[test]
    fn reinitializes_an_input_with_new_values() {
        let mut input = create_animation_blend_tree_input(player(1, 0.0, 0.0), 1.0, false);
        let new_player = player(2, 5.0, 0.0);
        initialize_animation_blend_tree_input(&mut input, new_player, 0.5, true);
        assert_eq!(input.weight, 0.5);
        assert!(input.additive);
    }
}

mod sample_animation_blend_tree {
    use super::*;

    #[test]
    fn normalizes_an_n_way_weighted_pose_by_target_identity() {
        let target: TargetRef = 1;
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(target, 0.0, 0.0), 1.0, false),
            create_animation_blend_tree_input(player(target, 10.0, 0.0), 2.0, false),
            create_animation_blend_tree_input(player(target, 20.0, 0.0), 1.0, false),
        ]);
        let mut seen: Vec<(TargetRef, f32)> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, channel, _| {
            seen.push((channel.target_ref, sampled[0]));
        });
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, target);
        assert_eq!(seen[0].1, 10.0);
    }

    #[test]
    fn keeps_one_sided_targets_in_stable_first_appearance_order() {
        let a: TargetRef = 1;
        let b: TargetRef = 2;
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(a, 3.0, 0.0), 1.0, false),
            create_animation_blend_tree_input(player(b, 7.0, 0.0), 1.0, false),
        ]);
        let mut seen: Vec<(TargetRef, f32)> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, channel, _| {
            seen.push((channel.target_ref, sampled[0]));
        });
        assert_eq!(seen, vec![(a, 3.0), (b, 7.0)]);
    }

    #[test]
    fn applies_additive_deltas_after_the_normalized_override_pose() {
        let target: TargetRef = 1;
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(target, 10.0, 0.0), 1.0, false),
            create_animation_blend_tree_input(player(target, 4.0, 0.0), 0.5, true),
        ]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![12.0]);
    }

    #[test]
    fn hemisphere_aligns_override_quaternions_and_composes_additive_rotation() {
        let target: TargetRef = 1;
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;
        let quarter_turn = [0.0, 0.0, sqrt1_2, sqrt1_2];
        let neg_quarter_turn = [0.0, 0.0, -sqrt1_2, -sqrt1_2];
        let half_turn = [0.0, 0.0, 1.0, 0.0];
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(
                quaternion_player(target, &quarter_turn),
                1.0,
                false,
            ),
            create_animation_blend_tree_input(
                quaternion_player(target, &neg_quarter_turn),
                1.0,
                false,
            ),
            create_animation_blend_tree_input(
                quaternion_player(target, &half_turn),
                0.5,
                true,
            ),
        ]);
        let mut seen: Vec<[f32; 4]> = Vec::new();
        sample_animation_blend_tree(
            &mut [0.0, 0.0, 0.0, 0.0],
            &mut tree,
            &mut |sampled, _, _| {
                seen.push([sampled[0], sampled[1], sampled[2], sampled[3]]);
            },
        );
        assert_eq!(seen.len(), 1);
        let q = seen[0];
        let length = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();
        assert!((length - 1.0).abs() < 1e-5);
        assert!(q[3].abs() < 1e-4);
    }

    #[test]
    fn uses_identity_as_the_base_of_an_additive_only_channel() {
        let target: TargetRef = 1;
        let mut tree = create_animation_blend_tree(&[create_animation_blend_tree_input(
            player(target, 8.0, 0.0),
            0.25,
            true,
        )]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_blend_tree(&mut [99.0], &mut tree, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![2.0]);
    }

    #[test]
    fn skips_targets_whose_weights_are_all_non_positive() {
        let mut tree = create_animation_blend_tree(&[create_animation_blend_tree_input(
            player(1, 8.0, 0.0),
            0.0,
            false,
        )]);
        let mut call_count = 0;
        sample_animation_blend_tree(&mut [99.0], &mut tree, &mut |_, _, _| {
            call_count += 1;
        });
        assert_eq!(call_count, 0);
    }
}

mod sample_animation_blend_tree_channel {
    use super::*;

    #[test]
    fn returns_false_and_preserves_output_for_an_absent_channel() {
        let mut out = [9.0];
        let mut tree = create_animation_blend_tree(&[]);
        assert!(!sample_animation_blend_tree_channel(&mut out, &mut tree, 0));
        assert_eq!(out, [9.0]);
    }
}

mod set_animation_blend_tree_input_weight {
    use super::*;

    #[test]
    fn updates_a_present_leaf_and_rejects_an_absent_index() {
        let mut tree = create_animation_blend_tree(&[create_animation_blend_tree_input(
            player(1, 1.0, 0.0),
            1.0,
            false,
        )]);
        assert!(set_animation_blend_tree_input_weight(&mut tree, 0, 0.25));
        assert_eq!(tree.inputs[0].weight, 0.25);
        assert!(!set_animation_blend_tree_input_weight(&mut tree, 4, 1.0));
    }
}
