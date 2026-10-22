use std::panic::AssertUnwindSafe;
use std::sync::{Arc, RwLock};

use flight_animation::contract::*;

fn test_target() -> TargetRef {
    return Some(Arc::new(0_usize));
}

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
            &Arc::new(RwLock::new({ let mut track = create_animation_track(); track.times = times; track.values = values; track })),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip)));
}

fn quaternion_player(target: TargetRef, values: &[f32]) -> AnimationPlayerRef {
    let clip = create_animation_clip(
        vec![create_animation_channel(
            &Arc::new(RwLock::new({ let mut track = create_animation_track(); track.components = 4; track.quaternion = true; track.times = vec![0.0]; track.values = values.to_vec(); track })),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip)));
}

mod advance_animation_blend_tree {
    use super::*;

    #[test]
    fn advances_a_shared_player_only_once() {
        let target = test_target();
        let shared = player(target, 0.0, 2.0);
        let tree = create_animation_blend_tree(&[
            { let mut created = create_animation_blend_tree_input(shared.clone()); created.weight = 0.25; created },
            { let mut created = create_animation_blend_tree_input(shared.clone()); created.weight = 0.75; created },
        ]);
        assert_eq!(tree.players.len(), 1);
        assert!(Arc::ptr_eq(&tree.players[0], &shared));
        advance_animation_blend_tree(&tree, 0.5);
        assert_eq!(shared.read().unwrap().time, 0.5);
    }
}

mod create_animation_blend_tree {
    use super::*;

    #[test]
    fn creates_with_target_matched_reusable_channels() {
        let target = test_target();
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(target.clone(), 1.0, 0.0)),
            create_animation_blend_tree_input(player(target, 2.0, 0.0)),
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
        let target = test_target();
        let track = Arc::new(RwLock::new({ let mut track = create_animation_track(); track.times = vec![0.0]; track.values = vec![1.0]; track }));
        let dup_clip = create_animation_clip(
            vec![
                create_animation_channel(&track, target.clone()),
                create_animation_channel(&track, target.clone()),
            ],
            None,
            &[],
        );
        let duplicate = Arc::new(RwLock::new(create_animation_player(dup_clip)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree(&[create_animation_blend_tree_input(duplicate)]);
        }));
        let err = result.unwrap_err();
        let msg = err.downcast_ref::<String>().map(|s| s.as_str()).unwrap();
        assert!(msg.contains("duplicate targetRef"));

        let scalar = player(target.clone(), 1.0, 0.0);
        let vector_clip = create_animation_clip(
            vec![create_animation_channel(
                &Arc::new(RwLock::new({ let mut track = create_animation_track(); track.components = 2; track.times = vec![0.0]; track.values = vec![1.0, 2.0]; track })),
                target,
            )],
            None,
            &[],
        );
        let vector = Arc::new(RwLock::new(create_animation_player(vector_clip)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree(&[
                create_animation_blend_tree_input(scalar),
                create_animation_blend_tree_input(vector),
            ]);
        }));
        let err = result.unwrap_err();
        let msg = err.downcast_ref::<String>().map(|s| s.as_str()).unwrap();
        assert!(msg.contains("different component widths"));
    }

    #[test]
    fn rejects_duplicate_nan_targets_within_one_input_clip() {
        let nan_target: TargetRef = Some(Arc::new(f64::NAN));
        let track = Arc::new(RwLock::new({ let mut track = create_animation_track(); track.times = vec![0.0]; track.values = vec![1.0]; track }));
        let dup_clip = create_animation_clip(
            vec![
                create_animation_channel(&track, nan_target.clone()),
                create_animation_channel(&track, nan_target),
            ],
            None,
            &[],
        );
        let dup_player = Arc::new(RwLock::new(create_animation_player(dup_clip)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree(&[create_animation_blend_tree_input(dup_player)]);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn coalesces_nan_targets_across_inputs() {
        let nan_a: TargetRef = Some(Arc::new(f64::NAN));
        let nan_b: TargetRef = Some(Arc::new(f64::NAN));
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(nan_a, 1.0, 0.0)),
            create_animation_blend_tree_input(player(nan_b, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 1);
        assert_eq!(tree.channels[0].sources.len(), 2);
    }

    #[test]
    fn coalesces_nan_from_f32_and_f64_representations() {
        let nan_f64: TargetRef = Some(Arc::new(f64::NAN));
        let nan_f32: TargetRef = Some(Arc::new(f32::NAN));
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(nan_f64, 1.0, 0.0)),
            create_animation_blend_tree_input(player(nan_f32, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 1);
        assert_eq!(tree.channels[0].sources.len(), 2);
    }

    #[test]
    fn preserves_object_identity_semantics_for_non_primitive_targets() {
        struct OpaqueTarget;
        let obj_a: TargetRef = Some(Arc::new(OpaqueTarget));
        let obj_b: TargetRef = Some(Arc::new(OpaqueTarget));
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(obj_a, 1.0, 0.0)),
            create_animation_blend_tree_input(player(obj_b, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 2);
    }

    #[test]
    fn coalesces_shared_arc_object_targets_across_inputs() {
        struct OpaqueTarget;
        let shared: TargetRef = Some(Arc::new(OpaqueTarget));
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(shared.clone(), 1.0, 0.0)),
            create_animation_blend_tree_input(player(shared, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 1);
        assert_eq!(tree.channels[0].sources.len(), 2);
    }

    #[test]
    fn coalesces_null_targets_across_inputs() {
        let null_a: TargetRef = None;
        let null_b: TargetRef = None;
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(null_a, 1.0, 0.0)),
            create_animation_blend_tree_input(player(null_b, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 1);
        assert_eq!(tree.channels[0].sources.len(), 2);
    }

    #[test]
    fn coalesces_string_targets_across_inputs() {
        let str_a: TargetRef = Some(Arc::new(String::from("position")));
        let str_b: TargetRef = Some(Arc::new(String::from("position")));
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(str_a, 1.0, 0.0)),
            create_animation_blend_tree_input(player(str_b, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 1);
        assert_eq!(tree.channels[0].sources.len(), 2);
    }

    #[test]
    fn keeps_boolean_targets_distinct_from_each_other() {
        let true_target: TargetRef = Some(Arc::new(true));
        let false_target: TargetRef = Some(Arc::new(false));
        let tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(true_target, 1.0, 0.0)),
            create_animation_blend_tree_input(player(false_target, 2.0, 0.0)),
        ]);
        assert_eq!(tree.channels.len(), 2);
    }
}

mod create_animation_blend_tree_input {
    use super::*;

    #[test]
    fn creates_a_mutable_weighted_leaf_with_override_defaults() {
        let input = create_animation_blend_tree_input(player(test_target(), 1.0, 0.0));
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
        let input = create_animation_blend_tree_input(player(test_target(), 5.0, 0.0));
        initialize_animation_blend_tree(&mut tree, &[input]);
        assert_eq!(tree.inputs.len(), 1);
    }
}

mod initialize_animation_blend_tree_input {
    use super::*;

    #[test]
    // Construction only (Principal c0f9227c): the player reference is rebound and weight/additive
    // return to the source defaults; the receiver keeps its entity identity.
    fn reinitializes_an_input_over_a_new_player_with_source_defaults() {
        let mut input =
            create_animation_blend_tree_input(player(test_target(), 0.0, 0.0));
        input.weight = 0.5;
        input.additive = true;
        let id = flight_entity::get_entity_id(&input);
        let new_player = player(test_target(), 5.0, 0.0);
        initialize_animation_blend_tree_input(&mut input, new_player.clone());
        assert!(Arc::ptr_eq(&input.player, &new_player));
        assert_eq!(input.weight, 1.0);
        assert!(!input.additive);
        assert_eq!(flight_entity::get_entity_id(&input), id);
    }
}

mod sample_animation_blend_tree {
    use super::*;

    #[test]
    fn normalizes_an_n_way_weighted_pose_by_target_identity() {
        let target = test_target();
        let target_clone = target.clone();
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(target.clone(), 0.0, 0.0)),
            { let mut created = create_animation_blend_tree_input(player(target.clone(), 10.0, 0.0)); created.weight = 2.0; created },
            create_animation_blend_tree_input(player(target, 20.0, 0.0)),
        ]);
        let mut seen_values: Vec<f32> = Vec::new();
        let mut seen_targets: Vec<TargetRef> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, channel, _| {
            seen_values.push(sampled[0]);
            seen_targets.push(channel.target_ref.clone());
        });
        assert_eq!(seen_values.len(), 1);
        assert_eq!(seen_values[0], 10.0);
        assert!(Arc::ptr_eq(seen_targets[0].as_ref().unwrap(), target_clone.as_ref().unwrap()));
    }

    #[test]
    fn keeps_one_sided_targets_in_stable_first_appearance_order() {
        let a = test_target();
        let a_clone = a.clone();
        let b: TargetRef = Some(Arc::new(1_usize));
        let b_clone = b.clone();
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(a, 3.0, 0.0)),
            create_animation_blend_tree_input(player(b, 7.0, 0.0)),
        ]);
        let mut seen: Vec<f32> = Vec::new();
        let mut seen_targets: Vec<TargetRef> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, channel, _| {
            seen.push(sampled[0]);
            seen_targets.push(channel.target_ref.clone());
        });
        assert_eq!(seen, vec![3.0, 7.0]);
        assert!(Arc::ptr_eq(seen_targets[0].as_ref().unwrap(), a_clone.as_ref().unwrap()));
        assert!(Arc::ptr_eq(seen_targets[1].as_ref().unwrap(), b_clone.as_ref().unwrap()));
    }

    #[test]
    fn applies_additive_deltas_after_the_normalized_override_pose() {
        let target = test_target();
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(target.clone(), 10.0, 0.0)),
            { let mut created = create_animation_blend_tree_input(player(target, 4.0, 0.0)); created.weight = 0.5; created.additive = true; created },
        ]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![12.0]);
    }

    #[test]
    fn hemisphere_aligns_override_quaternions_and_composes_additive_rotation() {
        let target = test_target();
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;
        let quarter_turn = [0.0, 0.0, sqrt1_2, sqrt1_2];
        let neg_quarter_turn = [0.0, 0.0, -sqrt1_2, -sqrt1_2];
        let half_turn = [0.0, 0.0, 1.0, 0.0];
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(quaternion_player(target.clone(), &quarter_turn)),
            create_animation_blend_tree_input(quaternion_player(target.clone(), &neg_quarter_turn)),
            { let mut created = create_animation_blend_tree_input(quaternion_player(target, &half_turn)); created.weight = 0.5; created.additive = true; created },
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
        let target = test_target();
        let mut tree = create_animation_blend_tree(&[{ let mut created = create_animation_blend_tree_input(player(target, 8.0, 0.0)); created.weight = 0.25; created.additive = true; created }]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_blend_tree(&mut [99.0], &mut tree, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![2.0]);
    }

    #[test]
    fn blends_nan_targeted_channels_across_inputs() {
        let nan_a: TargetRef = Some(Arc::new(f64::NAN));
        let nan_b: TargetRef = Some(Arc::new(f64::NAN));
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(player(nan_a, 0.0, 0.0)),
            create_animation_blend_tree_input(player(nan_b, 10.0, 0.0)),
        ]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_blend_tree(&mut [0.0], &mut tree, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0], 5.0);
    }

    #[test]
    fn skips_targets_whose_weights_are_all_non_positive() {
        let mut tree = create_animation_blend_tree(&[{ let mut created = create_animation_blend_tree_input(player(test_target(), 8.0, 0.0)); created.weight = 0.0; created }]);
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
        let mut tree = create_animation_blend_tree(&[create_animation_blend_tree_input(player(test_target(), 1.0, 0.0))]);
        assert!(set_animation_blend_tree_input_weight(&mut tree, 0, 0.25));
        assert_eq!(tree.inputs[0].weight, 0.25);
        assert!(!set_animation_blend_tree_input_weight(&mut tree, 4, 1.0));
    }
}
