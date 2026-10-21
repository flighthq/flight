use std::panic::AssertUnwindSafe;
use std::sync::{Arc, RwLock};

use flight_animation::contract::*;
use flight_animation::*;

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
            &Arc::new(RwLock::new(create_animation_track(
                CreateAnimationTrackOpts {
                    times,
                    values,
                    components: None,
                    interpolation: None,
                    quaternion: None,
                    easing: None,
                    segment_easings: None,
                },
            ))),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip, None)));
}

fn tree(players: &[AnimationPlayerRef]) -> AnimationBlendTreeRef {
    let inputs: Vec<AnimationBlendTreeInput> = players
        .iter()
        .map(|p| create_animation_blend_tree_input(p.clone(), 1.0, false))
        .collect();
    return create_animation_blend_tree_ref(&inputs);
}

mod advance_animation_layer_stack {
    use super::*;

    #[test]
    fn reuses_stack_scratch_and_advances_shared_players_and_sources_once() {
        let target = test_target();
        let shared = player(target, 0.0, 4.0);
        let shared_tree = tree(&[shared.clone()]);
        let machine_ref = create_animation_state_machine_ref(
            &[create_animation_state_machine_state(
                "only",
                tree(&[shared.clone()]),
            )],
            None,
        );
        let mut stack = create_animation_layer_stack(&[
            create_animation_blend_tree_layer(shared_tree.clone(), None),
            create_animation_blend_tree_layer(shared_tree.clone(), None),
            create_animation_state_machine_layer(machine_ref.clone(), None),
        ]);

        advance_animation_layer_stack(&mut stack, 0.5);

        assert_eq!(shared.read().unwrap().time, 0.5);
        assert_eq!(stack.advance_scratch.len(), 1);
        assert_eq!(stack.blend_trees.len(), 1);
        assert_eq!(stack.state_machines.len(), 1);
    }
}

mod create_animation_blend_tree_layer {
    use super::*;

    #[test]
    fn creates_and_validates_a_stable_channel_index_subset() {
        let a = test_target();
        let b: TargetRef = Some(Arc::new(1_usize));
        let source = tree(&[player(a, 1.0, 0.0), player(b, 2.0, 0.0)]);
        let layer = create_animation_blend_tree_layer(
            source.clone(),
            Some(&AnimationLayerOptions {
                additive: Some(true),
                channel_indices: Some(vec![1, 0]),
                weight: Some(0.5),
            }),
        );
        assert!(Arc::ptr_eq(layer.blend_tree.as_ref().unwrap(), &source));
        assert!(layer.state_machine.is_none());
        assert_eq!(layer.channel_indices, Some(vec![0, 1]));
        assert!(layer.additive);
        assert_eq!(layer.weight, 0.5);

        let source2 = source.clone();
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree_layer(
                source2,
                Some(&AnimationLayerOptions {
                    channel_indices: Some(vec![0, 0]),
                    additive: None,
                    weight: None,
                }),
            );
        }));
        assert!(result.is_err());

        let source3 = source.clone();
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_blend_tree_layer(
                source3,
                Some(&AnimationLayerOptions {
                    channel_indices: Some(vec![2]),
                    additive: None,
                    weight: None,
                }),
            );
        }));
        assert!(result.is_err());
    }
}

mod create_animation_layer_stack {
    use super::*;

    #[test]
    fn precomputes_target_correspondence_from_only_selected_source_channels() {
        let a = test_target();
        let b: TargetRef = Some(Arc::new(1_usize));
        let source = tree(&[player(a, 1.0, 0.0), player(b, 2.0, 0.0)]);
        let stack = create_animation_layer_stack(&[create_animation_blend_tree_layer(
            source,
            Some(&AnimationLayerOptions {
                channel_indices: Some(vec![1]),
                additive: None,
                weight: None,
            }),
        )]);
        assert_eq!(stack.channels.len(), 1);
    }

    #[test]
    fn rejects_incompatible_tracks_for_the_same_target() {
        let target = test_target();
        let scalar = tree(&[player(target.clone(), 1.0, 0.0)]);
        let vector_clip = create_animation_clip(
            vec![create_animation_channel(
                &Arc::new(RwLock::new(create_animation_track(
                    CreateAnimationTrackOpts {
                        components: Some(2),
                        times: vec![0.0],
                        values: vec![1.0, 2.0],
                        interpolation: None,
                        quaternion: None,
                        easing: None,
                        segment_easings: None,
                    },
                ))),
                target,
            )],
            None,
            &[],
        );
        let vector_player = Arc::new(RwLock::new(create_animation_player(vector_clip, None)));
        let vector = tree(&[vector_player]);
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_layer_stack(&[
                create_animation_blend_tree_layer(scalar, None),
                create_animation_blend_tree_layer(vector, None),
            ]);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn coalesces_nan_targets_across_layers() {
        let nan_a: TargetRef = Some(Arc::new(f64::NAN));
        let nan_b: TargetRef = Some(Arc::new(f64::NAN));
        let layer_a = tree(&[player(nan_a, 1.0, 0.0)]);
        let layer_b = tree(&[player(nan_b, 2.0, 0.0)]);
        let stack = create_animation_layer_stack(&[
            create_animation_blend_tree_layer(layer_a, None),
            create_animation_blend_tree_layer(layer_b, None),
        ]);
        assert_eq!(stack.channels.len(), 1);
        assert_eq!(stack.channels[0].sources.len(), 2);
    }

    #[test]
    fn keeps_distinct_opaque_object_targets_separate_across_layers() {
        struct OpaqueTarget;
        let obj_a: TargetRef = Some(Arc::new(OpaqueTarget));
        let obj_b: TargetRef = Some(Arc::new(OpaqueTarget));
        let layer_a = tree(&[player(obj_a, 1.0, 0.0)]);
        let layer_b = tree(&[player(obj_b, 2.0, 0.0)]);
        let stack = create_animation_layer_stack(&[
            create_animation_blend_tree_layer(layer_a, None),
            create_animation_blend_tree_layer(layer_b, None),
        ]);
        assert_eq!(stack.channels.len(), 2);
    }

    #[test]
    fn coalesces_nan_from_mixed_f32_and_f64_targets_across_layers() {
        let nan_f32: TargetRef = Some(Arc::new(f32::NAN));
        let nan_f64: TargetRef = Some(Arc::new(f64::NAN));
        let layer_a = tree(&[player(nan_f32, 1.0, 0.0)]);
        let layer_b = tree(&[player(nan_f64, 2.0, 0.0)]);
        let stack = create_animation_layer_stack(&[
            create_animation_blend_tree_layer(layer_a, None),
            create_animation_blend_tree_layer(layer_b, None),
        ]);
        assert_eq!(stack.channels.len(), 1);
        assert_eq!(stack.channels[0].sources.len(), 2);
    }
}

mod create_animation_state_machine_layer {
    use super::*;

    #[test]
    fn creates_a_layer_over_the_machine_global_channel_layout() {
        let source = create_animation_state_machine_ref(
            &[create_animation_state_machine_state(
                "only",
                tree(&[player(test_target(), 1.0, 0.0)]),
            )],
            None,
        );
        let layer = create_animation_state_machine_layer(source.clone(), None);
        assert!(layer.blend_tree.is_none());
        assert!(Arc::ptr_eq(layer.state_machine.as_ref().unwrap(), &source));
    }
}

mod initialize_animation_layer_stack {
    use super::*;

    #[test]
    fn reinitializes_a_stack_with_new_layers() {
        let mut stack = create_animation_layer_stack(&[create_animation_blend_tree_layer(
            tree(&[player(test_target(), 1.0, 0.0)]),
            None,
        )]);
        let a: TargetRef = Some(Arc::new(1_usize));
        let b: TargetRef = Some(Arc::new(2_usize));
        let new_layer = create_animation_blend_tree_layer(
            tree(&[player(a, 2.0, 0.0), player(b, 3.0, 0.0)]),
            None,
        );
        initialize_animation_layer_stack(&mut stack, &[new_layer]);
        assert_eq!(stack.layers.len(), 1);
        assert_eq!(stack.channels.len(), 2);
    }
}

mod sample_animation_layer_stack {
    use super::*;

    #[test]
    fn applies_an_override_mask_and_additive_layer_in_stable_target_order() {
        let body = test_target();
        let arm: TargetRef = Some(Arc::new(1_usize));
        let base = tree(&[
            player(body.clone(), 4.0, 0.0),
            player(arm.clone(), 10.0, 0.0),
        ]);
        let upper = tree(&[
            player(body.clone(), 100.0, 0.0),
            player(arm.clone(), 30.0, 0.0),
        ]);
        let additive = tree(&[player(arm.clone(), 8.0, 0.0)]);
        let mut stack = create_animation_layer_stack(&[
            create_animation_blend_tree_layer(base, None),
            create_animation_blend_tree_layer(
                upper,
                Some(&AnimationLayerOptions {
                    channel_indices: Some(vec![1]),
                    weight: Some(0.5),
                    additive: None,
                }),
            ),
            create_animation_blend_tree_layer(
                additive,
                Some(&AnimationLayerOptions {
                    additive: Some(true),
                    weight: Some(0.25),
                    channel_indices: None,
                }),
            ),
        ]);
        let mut seen: Vec<(usize, f32)> = Vec::new();
        sample_animation_layer_stack(&mut [0.0], &mut stack, &mut |sampled, _channel, index| {
            seen.push((index, sampled[0]));
        });
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0], (0, 4.0));
        assert_eq!(seen[1], (1, 22.0));
    }

    #[test]
    fn samples_a_transitioning_state_machine_layer() {
        let target = test_target();
        let machine = create_animation_state_machine_ref(
            &[
                create_animation_state_machine_state(
                    "from",
                    tree(&[player(target.clone(), 0.0, 0.0)]),
                ),
                create_animation_state_machine_state("to", tree(&[player(target, 20.0, 0.0)])),
            ],
            None,
        );
        {
            let mut m = machine.write().unwrap();
            transition_animation_state_machine(&mut m, StateRef::Name("to".to_string()), 2.0, None);
            m.transition_elapsed = 1.0;
            m.transition_weight = 0.5;
        }
        let mut stack =
            create_animation_layer_stack(&[create_animation_state_machine_layer(machine, None)]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_layer_stack(&mut [0.0], &mut stack, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![10.0]);
    }

    #[test]
    fn blends_nan_targeted_layers_through_override_weight() {
        let nan_a: TargetRef = Some(Arc::new(f64::NAN));
        let nan_b: TargetRef = Some(Arc::new(f64::NAN));
        let base = tree(&[player(nan_a, 0.0, 0.0)]);
        let upper = tree(&[player(nan_b, 20.0, 0.0)]);
        let mut stack = create_animation_layer_stack(&[
            create_animation_blend_tree_layer(base, None),
            create_animation_blend_tree_layer(
                upper,
                Some(&AnimationLayerOptions {
                    weight: Some(0.5),
                    additive: None,
                    channel_indices: None,
                }),
            ),
        ]);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_layer_stack(&mut [0.0], &mut stack, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0], 10.0);
    }
}

mod sample_animation_layer_stack_channel {
    use super::*;

    #[test]
    fn uses_identity_for_an_additive_only_target_and_preserves_output_for_an_absent_channel() {
        let mut stack = create_animation_layer_stack(&[create_animation_blend_tree_layer(
            tree(&[player(test_target(), 8.0, 0.0)]),
            Some(&AnimationLayerOptions {
                additive: Some(true),
                weight: Some(0.25),
                channel_indices: None,
            }),
        )]);
        let mut out = [99.0];
        assert!(sample_animation_layer_stack_channel(
            &mut out, &mut stack, 0
        ));
        assert_eq!(out, [2.0]);
        assert!(!sample_animation_layer_stack_channel(
            &mut out, &mut stack, 4
        ));
        assert_eq!(out, [2.0]);
    }
}

mod set_animation_layer_weight {
    use super::*;

    #[test]
    fn updates_a_present_layer_and_rejects_an_absent_index() {
        let mut stack = create_animation_layer_stack(&[create_animation_blend_tree_layer(
            tree(&[player(test_target(), 1.0, 0.0)]),
            None,
        )]);
        assert!(set_animation_layer_weight(&mut stack, 0, 0.25));
        assert_eq!(stack.layers[0].weight, 0.25);
        assert!(!set_animation_layer_weight(&mut stack, 2, 1.0));
    }
}
