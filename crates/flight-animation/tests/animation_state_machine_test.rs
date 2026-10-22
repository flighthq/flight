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
            &Arc::new(RwLock::new({
                let mut track = create_animation_track();
                track.times = times;
                track.values = values;
                track
            })),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip)));
}

fn state(name: &str, players: &[AnimationPlayerRef]) -> AnimationStateMachineState {
    let inputs: Vec<AnimationBlendTreeInput> = players
        .iter()
        .map(|p| create_animation_blend_tree_input(p.clone()))
        .collect();
    return {
        let mut created =
            create_animation_state_machine_state(create_animation_blend_tree_ref(&inputs));
        created.name = (name).to_string();
        created
    };
}

mod advance_animation_state_machine {
    use super::*;

    #[test]
    fn advances_both_transition_states_deduplicates_players_and_completes_by_duration() {
        let target = test_target();
        let shared = player(target.clone(), 0.0, 4.0);
        let destination = player(target, 20.0, 4.0);
        let mut machine = create_animation_state_machine(
            &[
                state("idle", &[shared.clone()]),
                state("walk", &[shared.clone(), destination.clone()]),
            ],
            None,
        );
        assert!(transition_animation_state_machine(
            &mut machine,
            StateRef::Name("walk".to_string()),
            1.0,
            None,
        ));
        advance_animation_state_machine(&mut machine, 0.5);
        assert_eq!(shared.read().unwrap().time, 0.5);
        assert_eq!(destination.read().unwrap().time, 0.5);
        assert_eq!(machine.advance_scratch.len(), 2);
        let scratch_ptr = machine.advance_scratch.as_ptr();
        assert_eq!(machine.transition_weight, 0.5);
        advance_animation_state_machine(&mut machine, 0.5);
        assert_eq!(machine.advance_scratch.as_ptr(), scratch_ptr);
        advance_animation_state_machine(&mut machine, 0.5);
        assert_eq!(
            get_animation_state_machine_current_state(&machine).name,
            "walk"
        );
        assert!(!is_animation_state_machine_transitioning(&machine));
    }
}

mod create_animation_state_machine {
    use super::*;

    #[test]
    fn creates_with_named_initial_state_and_global_target_correspondence() {
        let shared = test_target();
        let idle_only: TargetRef = Some(Arc::new(1_usize));
        let machine = create_animation_state_machine(
            &[
                state(
                    "idle",
                    &[
                        player(shared.clone(), 0.0, 0.0),
                        player(idle_only, 1.0, 0.0),
                    ],
                ),
                state("walk", &[player(shared, 2.0, 0.0)]),
            ],
            Some(StateRef::Name("walk".to_string())),
        );
        assert_eq!(
            get_animation_state_machine_current_state(&machine).name,
            "walk"
        );
        assert_eq!(machine.channels.len(), 2);
        assert_eq!(
            machine.channels[0].state_channel_indices,
            vec![Some(0), Some(0)]
        );
        assert_eq!(
            machine.channels[1].state_channel_indices,
            vec![Some(1), None]
        );
    }

    #[test]
    fn rejects_empty_duplicate_named_missing_initial_and_incompatible_states() {
        let result = std::panic::catch_unwind(|| {
            create_animation_state_machine(&[], None);
        });
        let err = result.unwrap_err();
        let msg = err.downcast_ref::<&str>().copied().unwrap();
        assert!(msg.contains("at least one state"));

        let target = test_target();
        let a = state("same", &[player(target.clone(), 0.0, 0.0)]);
        let b = state("same", &[player(target.clone(), 1.0, 0.0)]);
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_state_machine(&[a, b], None);
        }));
        let err = result.unwrap_err();
        let msg = err.downcast_ref::<String>().map(|s| s.as_str()).unwrap();
        assert!(msg.contains("duplicate state"));

        let c = state("only", &[player(target.clone(), 0.0, 0.0)]);
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_state_machine(&[c], Some(StateRef::Name("missing".to_string())));
        }));
        let err = result.unwrap_err();
        let msg = err.downcast_ref::<&str>().copied().unwrap();
        assert!(msg.contains("initial state does not exist"));

        let scalar = state("scalar", &[player(target.clone(), 0.0, 0.0)]);
        let vector_clip = create_animation_clip(
            vec![create_animation_channel(
                &Arc::new(RwLock::new({
                    let mut track = create_animation_track();
                    track.components = 2;
                    track.times = vec![0.0];
                    track.values = vec![0.0, 1.0];
                    track
                })),
                target,
            )],
            None,
            &[],
        );
        let vector_player = Arc::new(RwLock::new(create_animation_player(vector_clip)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_state_machine(&[scalar, state("vector", &[vector_player])], None);
        }));
        let err = result.unwrap_err();
        let msg = err.downcast_ref::<&str>().copied().unwrap();
        assert!(msg.contains("incompatible tracks"));
    }

    #[test]
    fn coalesces_nan_targets_across_states() {
        let nan_a: TargetRef = Some(Arc::new(f64::NAN));
        let nan_b: TargetRef = Some(Arc::new(f64::NAN));
        let machine = create_animation_state_machine(
            &[
                state("idle", &[player(nan_a, 0.0, 0.0)]),
                state("walk", &[player(nan_b, 10.0, 0.0)]),
            ],
            None,
        );
        assert_eq!(machine.channels.len(), 1);
        assert_eq!(
            machine.channels[0].state_channel_indices,
            vec![Some(0), Some(0)]
        );
    }

    #[test]
    fn keeps_distinct_opaque_object_targets_separate_across_states() {
        struct OpaqueTarget;
        let obj_a: TargetRef = Some(Arc::new(OpaqueTarget));
        let obj_b: TargetRef = Some(Arc::new(OpaqueTarget));
        let machine = create_animation_state_machine(
            &[
                state("idle", &[player(obj_a, 0.0, 0.0)]),
                state("walk", &[player(obj_b, 10.0, 0.0)]),
            ],
            None,
        );
        assert_eq!(machine.channels.len(), 2);
    }

    #[test]
    fn coalesces_nan_from_mixed_f32_and_f64_across_states() {
        let nan_f32: TargetRef = Some(Arc::new(f32::NAN));
        let nan_f64: TargetRef = Some(Arc::new(f64::NAN));
        let machine = create_animation_state_machine(
            &[
                state("idle", &[player(nan_f32, 0.0, 0.0)]),
                state("walk", &[player(nan_f64, 10.0, 0.0)]),
            ],
            None,
        );
        assert_eq!(machine.channels.len(), 1);
        assert_eq!(
            machine.channels[0].state_channel_indices,
            vec![Some(0), Some(0)]
        );
    }
}

mod create_animation_state_machine_ref {
    use super::*;

    #[test]
    fn wraps_the_machine_in_a_shared_ref() {
        let machine_ref = create_animation_state_machine_ref(
            &[state("only", &[player(test_target(), 0.0, 0.0)])],
            None,
        );
        let m = machine_ref.read().unwrap();
        assert_eq!(get_animation_state_machine_current_state(&m).name, "only");
    }
}

mod create_animation_state_machine_state {
    use super::*;

    #[test]
    fn creates_a_named_state_over_a_caller_owned_blend_tree() {
        let tree = create_animation_blend_tree_ref(&[]);
        let result = {
            let mut created = create_animation_state_machine_state(tree.clone());
            created.name = ("empty").to_string();
            created
        };
        assert!(Arc::ptr_eq(&result.blend_tree, &tree));
        assert_eq!(result.name, "empty");
    }
}

mod get_animation_state_machine_current_state {
    use super::*;

    #[test]
    fn keeps_the_source_current_until_transition_completion() {
        let target = test_target();
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(target.clone(), 0.0, 0.0)]),
                state("b", &[player(target, 1.0, 0.0)]),
            ],
            None,
        );
        transition_animation_state_machine(
            &mut machine,
            StateRef::Name("b".to_string()),
            1.0,
            None,
        );
        assert_eq!(
            get_animation_state_machine_current_state(&machine).name,
            "a"
        );
    }
}

mod initialize_animation_state_machine {
    use super::*;

    #[test]
    fn reinitializes_a_machine_with_new_states() {
        let target = test_target();
        let mut machine = create_animation_state_machine(
            &[state("a", &[player(target.clone(), 0.0, 0.0)])],
            None,
        );
        initialize_animation_state_machine(
            &mut machine,
            &[
                state("x", &[player(target.clone(), 1.0, 0.0)]),
                state("y", &[player(target, 2.0, 0.0)]),
            ],
            None,
        );
        assert_eq!(machine.states.len(), 2);
        assert_eq!(
            get_animation_state_machine_current_state(&machine).name,
            "x"
        );
    }
}

mod initialize_animation_state_machine_state {
    use super::*;

    #[test]
    // Construction only (Principal c0f9227c): the blend tree is rebound, the name returns to the
    // source default, and the receiver keeps its entity identity.
    fn reinitializes_a_state_over_a_new_tree_with_the_default_name() {
        let tree = create_animation_blend_tree_ref(&[]);
        let mut s = create_animation_state_machine_state(tree);
        s.name = "old".to_string();
        let id = flight_entity::get_entity_id(&s);
        let new_tree = create_animation_blend_tree_ref(&[]);
        initialize_animation_state_machine_state(&mut s, new_tree.clone());
        assert_eq!(s.name, "");
        assert!(Arc::ptr_eq(&s.blend_tree, &new_tree));
        assert_eq!(flight_entity::get_entity_id(&s), id);
    }
}

mod is_animation_state_machine_transitioning {
    use super::*;

    #[test]
    fn tracks_the_active_timed_transition_lifecycle() {
        let target = test_target();
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(target.clone(), 0.0, 0.0)]),
                state("b", &[player(target, 1.0, 0.0)]),
            ],
            None,
        );
        assert!(!is_animation_state_machine_transitioning(&machine));
        transition_animation_state_machine(
            &mut machine,
            StateRef::Name("b".to_string()),
            1.0,
            None,
        );
        assert!(is_animation_state_machine_transitioning(&machine));
    }
}

mod sample_animation_state_machine {
    use super::*;

    #[test]
    fn samples_a_current_n_way_blend_tree() {
        let target = test_target();
        let tree = create_animation_blend_tree_ref(&[
            create_animation_blend_tree_input(player(target.clone(), 0.0, 0.0)),
            {
                let mut created = create_animation_blend_tree_input(player(target, 20.0, 0.0));
                created.weight = 3.0;
                created
            },
        ]);
        let mut machine = create_animation_state_machine(
            &[{
                let mut created = create_animation_state_machine_state(tree);
                created.name = ("locomotion").to_string();
                created
            }],
            None,
        );
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_state_machine(&mut [0.0], &mut machine, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen, vec![15.0]);
    }

    #[test]
    fn blends_matching_targets_and_passes_one_sided_targets_through_during_transition() {
        let shared = test_target();
        let from_only: TargetRef = Some(Arc::new(1_usize));
        let to_only: TargetRef = Some(Arc::new(2_usize));
        let mut machine = create_animation_state_machine(
            &[
                state(
                    "from",
                    &[
                        player(shared.clone(), 0.0, 0.0),
                        player(from_only, 3.0, 0.0),
                    ],
                ),
                state(
                    "to",
                    &[player(shared, 20.0, 0.0), player(to_only, 7.0, 0.0)],
                ),
            ],
            None,
        );
        transition_animation_state_machine(
            &mut machine,
            StateRef::Name("to".to_string()),
            2.0,
            None,
        );
        advance_animation_state_machine(&mut machine, 1.0);
        let mut seen: Vec<(usize, f32)> = Vec::new();
        sample_animation_state_machine(
            &mut [0.0],
            &mut machine,
            &mut |sampled, _channel, index| {
                seen.push((index, sampled[0]));
            },
        );
        assert_eq!(seen.len(), 3);
        assert_eq!(seen[0], (0, 10.0));
        assert_eq!(seen[1], (1, 3.0));
        assert_eq!(seen[2], (2, 7.0));
    }

    #[test]
    fn blends_nan_targeted_channels_during_state_transition() {
        let nan_a: TargetRef = Some(Arc::new(f64::NAN));
        let nan_b: TargetRef = Some(Arc::new(f64::NAN));
        let mut machine = create_animation_state_machine(
            &[
                state("from", &[player(nan_a, 0.0, 0.0)]),
                state("to", &[player(nan_b, 20.0, 0.0)]),
            ],
            None,
        );
        transition_animation_state_machine(
            &mut machine,
            StateRef::Name("to".to_string()),
            2.0,
            None,
        );
        advance_animation_state_machine(&mut machine, 1.0);
        let mut seen: Vec<f32> = Vec::new();
        sample_animation_state_machine(&mut [0.0], &mut machine, &mut |sampled, _, _| {
            seen.push(sampled[0]);
        });
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0], 10.0);
    }
}

mod sample_animation_state_machine_channel {
    use super::*;

    #[test]
    fn samples_one_global_channel_and_preserves_output_for_an_absent_index() {
        let mut machine = create_animation_state_machine(
            &[state("only", &[player(test_target(), 7.0, 0.0)])],
            None,
        );
        let mut out = [99.0];
        assert!(sample_animation_state_machine_channel(
            &mut out,
            &mut machine,
            0
        ));
        assert_eq!(out, [7.0]);
        assert!(!sample_animation_state_machine_channel(
            &mut out,
            &mut machine,
            3
        ));
        assert_eq!(out, [7.0]);
    }
}

mod transition_animation_state_machine {
    use super::*;

    #[test]
    fn supports_curved_and_zero_duration_transitions() {
        fn square(t: f32) -> f32 {
            return t * t;
        }
        let target = test_target();
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(target.clone(), 0.0, 0.0)]),
                state("b", &[player(target, 1.0, 0.0)]),
            ],
            None,
        );
        assert!(transition_animation_state_machine(
            &mut machine,
            StateRef::Name("b".to_string()),
            2.0,
            Some(Arc::new(square)),
        ));
        advance_animation_state_machine(&mut machine, 1.0);
        assert_eq!(machine.transition_weight, 0.25);

        advance_animation_state_machine(&mut machine, 1.0);
        assert!(transition_animation_state_machine(
            &mut machine,
            StateRef::Name("a".to_string()),
            0.0,
            None,
        ));
        assert_eq!(
            get_animation_state_machine_current_state(&machine).name,
            "a"
        );
    }

    #[test]
    fn rejects_unknown_same_state_and_overlapping_transition_requests() {
        let target = test_target();
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(target.clone(), 0.0, 0.0)]),
                state("b", &[player(target, 1.0, 0.0)]),
            ],
            None,
        );
        assert!(!transition_animation_state_machine(
            &mut machine,
            StateRef::Name("missing".to_string()),
            1.0,
            None,
        ));
        assert!(!transition_animation_state_machine(
            &mut machine,
            StateRef::Name("a".to_string()),
            1.0,
            None,
        ));
        assert!(transition_animation_state_machine(
            &mut machine,
            StateRef::Name("b".to_string()),
            1.0,
            None,
        ));
        assert!(!transition_animation_state_machine(
            &mut machine,
            StateRef::Name("a".to_string()),
            1.0,
            None,
        ));
    }
}
