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

fn state(name: &str, players: &[AnimationPlayerRef]) -> AnimationStateMachineState {
    let inputs: Vec<AnimationBlendTreeInput> = players
        .iter()
        .map(|p| create_animation_blend_tree_input(p.clone(), 1.0, false))
        .collect();
    return create_animation_state_machine_state(
        name,
        create_animation_blend_tree_ref(&inputs),
    );
}

mod advance_animation_state_machine {
    use super::*;

    #[test]
    fn advances_both_transition_states_deduplicates_players_and_completes_by_duration() {
        let target: TargetRef = 1;
        let shared = player(target, 0.0, 4.0);
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
        assert_eq!(machine.transition_weight, 0.5);
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
        let shared: TargetRef = 1;
        let idle_only: TargetRef = 2;
        let machine = create_animation_state_machine(
            &[
                state(
                    "idle",
                    &[player(shared, 0.0, 0.0), player(idle_only, 1.0, 0.0)],
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
        assert!(result.is_err());

        let a = state("same", &[player(1, 0.0, 0.0)]);
        let b = state("same", &[player(1, 1.0, 0.0)]);
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_state_machine(&[a, b], None);
        }));
        assert!(result.is_err());

        let c = state("only", &[player(1, 0.0, 0.0)]);
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_state_machine(
                &[c],
                Some(StateRef::Name("missing".to_string())),
            );
        }));
        assert!(result.is_err());

        let target: TargetRef = 1;
        let scalar = state("scalar", &[player(target, 0.0, 0.0)]);
        let vector_clip = create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(2),
                    times: vec![0.0],
                    values: vec![0.0, 1.0],
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
        let vector_player = Arc::new(RwLock::new(create_animation_player(vector_clip, None)));
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            create_animation_state_machine(
                &[scalar, state("vector", &[vector_player])],
                None,
            );
        }));
        assert!(result.is_err());
    }
}

mod create_animation_state_machine_ref {
    use super::*;

    #[test]
    fn wraps_the_machine_in_a_shared_ref() {
        let machine_ref = create_animation_state_machine_ref(
            &[state("only", &[player(1, 0.0, 0.0)])],
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
        let result = create_animation_state_machine_state("empty", tree.clone());
        assert!(Arc::ptr_eq(&result.blend_tree, &tree));
        assert_eq!(result.name, "empty");
    }
}

mod get_animation_state_machine_current_state {
    use super::*;

    #[test]
    fn keeps_the_source_current_until_transition_completion() {
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(1, 0.0, 0.0)]),
                state("b", &[player(1, 1.0, 0.0)]),
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
        let mut machine = create_animation_state_machine(
            &[state("a", &[player(1, 0.0, 0.0)])],
            None,
        );
        initialize_animation_state_machine(
            &mut machine,
            &[
                state("x", &[player(1, 1.0, 0.0)]),
                state("y", &[player(1, 2.0, 0.0)]),
            ],
            None,
        );
        assert_eq!(machine.states.len(), 2);
        assert_eq!(get_animation_state_machine_current_state(&machine).name, "x");
    }
}

mod initialize_animation_state_machine_state {
    use super::*;

    #[test]
    fn reinitializes_a_state_with_new_name_and_tree() {
        let tree = create_animation_blend_tree_ref(&[]);
        let mut s = create_animation_state_machine_state("old", tree);
        let new_tree = create_animation_blend_tree_ref(&[]);
        initialize_animation_state_machine_state(&mut s, "new", new_tree.clone());
        assert_eq!(s.name, "new");
        assert!(Arc::ptr_eq(&s.blend_tree, &new_tree));
    }
}

mod is_animation_state_machine_transitioning {
    use super::*;

    #[test]
    fn tracks_the_active_timed_transition_lifecycle() {
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(1, 0.0, 0.0)]),
                state("b", &[player(1, 1.0, 0.0)]),
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
        let target: TargetRef = 1;
        let tree = create_animation_blend_tree_ref(&[
            create_animation_blend_tree_input(player(target, 0.0, 0.0), 1.0, false),
            create_animation_blend_tree_input(player(target, 20.0, 0.0), 3.0, false),
        ]);
        let mut machine = create_animation_state_machine(
            &[create_animation_state_machine_state("locomotion", tree)],
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
        let shared: TargetRef = 1;
        let from_only: TargetRef = 2;
        let to_only: TargetRef = 3;
        let mut machine = create_animation_state_machine(
            &[
                state(
                    "from",
                    &[player(shared, 0.0, 0.0), player(from_only, 3.0, 0.0)],
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
        let mut seen: Vec<(TargetRef, f32)> = Vec::new();
        sample_animation_state_machine(&mut [0.0], &mut machine, &mut |sampled, channel, _| {
            seen.push((channel.target_ref, sampled[0]));
        });
        assert_eq!(
            seen,
            vec![(shared, 10.0), (from_only, 3.0), (to_only, 7.0)]
        );
    }
}

mod sample_animation_state_machine_channel {
    use super::*;

    #[test]
    fn samples_one_global_channel_and_preserves_output_for_an_absent_index() {
        let mut machine = create_animation_state_machine(
            &[state("only", &[player(1, 7.0, 0.0)])],
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
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(1, 0.0, 0.0)]),
                state("b", &[player(1, 1.0, 0.0)]),
            ],
            None,
        );
        assert!(transition_animation_state_machine(
            &mut machine,
            StateRef::Name("b".to_string()),
            2.0,
            Some(square),
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
        let mut machine = create_animation_state_machine(
            &[
                state("a", &[player(1, 0.0, 0.0)]),
                state("b", &[player(1, 1.0, 0.0)]),
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
