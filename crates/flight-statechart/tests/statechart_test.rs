use flight_statechart::*;

fn expect_throw_kind<F: FnOnce()>(expected: flight_entity::FlightErrorKind, run: F) {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run));
    match result {
        Ok(_) => panic!("expected a typed throw"),
        Err(payload) => {
            let error = payload
                .downcast::<flight_entity::FlightError>()
                .expect("expected a D10 typed panic payload");
            assert_eq!(error.kind, expected);
        }
    }
}


// ============================================================================
// Test helpers
// ============================================================================

fn condition(input_index: i32, comparison: StatechartComparison, value: f64) -> StatechartCondition {
    return StatechartCondition {
        comparison,
        input_index,
        value,
    };
}

fn create_empty_chart() -> Statechart {
    return Statechart {
        inputs: Vec::new(),
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: vec![StatechartState {
                kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                name: None,
                transitions: Vec::new(),
            }],
        }],
    };
}

fn create_single_transition_chart(
    inputs: Vec<StatechartInput>,
    conditions: Vec<StatechartCondition>,
    duration_ms: f64,
    exit_time_ratio: f64,
) -> Statechart {
    return Statechart {
        inputs,
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: vec![
                StatechartState {
                    kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                    name: None,
                    transitions: vec![transition(1, conditions, duration_ms, exit_time_ratio)],
                },
                StatechartState {
                    kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                    name: None,
                    transitions: Vec::new(),
                },
            ],
        }],
    };
}

fn create_two_region_trigger_chart() -> Statechart {
    let trigger_transition = transition(
        1,
        vec![condition(0, StatechartComparison::GreaterThan, 999.0)],
        0.0,
        -1.0,
    );
    let make_region = |t: StatechartTransition| StatechartRegion {
        initial_state_index: 0,
        name: None,
        states: vec![
            StatechartState {
                kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                name: None,
                transitions: vec![t],
            },
            StatechartState {
                kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                name: None,
                transitions: Vec::new(),
            },
        ],
    };
    return Statechart {
        inputs: vec![StatechartInput {
            initial_value: 0.0,
            kind: StatechartInputKind::Trigger,
            name: Some("go".to_string()),
        }],
        name: None,
        regions: vec![
            make_region(trigger_transition.clone()),
            make_region(trigger_transition),
        ],
    };
}

fn transition(
    target_state_index: i32,
    conditions: Vec<StatechartCondition>,
    duration_ms: f64,
    exit_time_ratio: f64,
) -> StatechartTransition {
    return StatechartTransition {
        conditions,
        duration_ms,
        exit_time_ratio,
        target_state_index,
    };
}

// ============================================================================
// advance_statechart_instance
// ============================================================================

mod advance_statechart_instance {
    use super::*;

    #[test]
    fn advances_every_concurrent_region_before_clearing_a_shared_trigger() {
        let chart = create_two_region_trigger_chart();
        let instance = crate::create_instance(&chart);

        fire_statechart_trigger(&instance, 0);
        assert_eq!(advance_statechart_instance(&instance, 0.0), 2);
        assert_eq!(&*(instance.read().unwrap().region_states), &(vec![1, 1])[..]);
        assert_eq!(instance.read().unwrap().input_values[0], 0.0);
    }

    #[test]
    fn requires_all_data_only_conditions_and_selects_the_first_eligible_transition() {
        let chart = Statechart {
            inputs: vec![
                StatechartInput {
                    initial_value: 0.0,
                    kind: StatechartInputKind::Boolean,
                    name: Some("armed".to_string()),
                },
                StatechartInput {
                    initial_value: 2.0,
                    kind: StatechartInputKind::Number,
                    name: Some("speed".to_string()),
                },
            ],
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 0,
                name: None,
                states: vec![
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: vec![
                            transition(
                                1,
                                vec![condition(0, StatechartComparison::Equal, 1.0)],
                                0.0,
                                -1.0,
                            ),
                            transition(
                                2,
                                vec![
                                    condition(0, StatechartComparison::Equal, 0.0),
                                    condition(1, StatechartComparison::GreaterThan, 4.0),
                                ],
                                0.0,
                                -1.0,
                            ),
                            transition(
                                1,
                                vec![
                                    condition(0, StatechartComparison::Equal, 0.0),
                                    condition(1, StatechartComparison::LessThanOrEqual, 2.0),
                                ],
                                0.0,
                                -1.0,
                            ),
                        ],
                    },
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
        let instance = crate::create_instance(&chart);

        assert_eq!(advance_statechart_instance(&instance, 0.0), 1);
        assert_eq!(instance.read().unwrap().region_states[0], 1);
    }

    #[test]
    fn evaluates_equal_numeric_comparison() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 3.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::Equal, 3.0)],
            0.0,
            -1.0,
        );
        assert_eq!(
            advance_statechart_instance(&mut crate::create_instance(&chart), 0.0) == 1,
            true
        );
    }

    #[test]
    fn evaluates_greater_than_numeric_comparison() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 3.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::GreaterThan, 2.0)],
            0.0,
            -1.0,
        );
        assert_eq!(
            advance_statechart_instance(&mut crate::create_instance(&chart), 0.0) == 1,
            true
        );
    }

    #[test]
    fn evaluates_greater_than_or_equal_numeric_comparison() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 3.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::GreaterThanOrEqual, 3.0)],
            0.0,
            -1.0,
        );
        assert_eq!(
            advance_statechart_instance(&mut crate::create_instance(&chart), 0.0) == 1,
            true
        );
    }

    #[test]
    fn evaluates_less_than_numeric_comparison() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 3.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::LessThan, 4.0)],
            0.0,
            -1.0,
        );
        assert_eq!(
            advance_statechart_instance(&mut crate::create_instance(&chart), 0.0) == 1,
            true
        );
    }

    #[test]
    fn evaluates_less_than_or_equal_numeric_comparison() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 3.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::LessThanOrEqual, 3.0)],
            0.0,
            -1.0,
        );
        assert_eq!(
            advance_statechart_instance(&mut crate::create_instance(&chart), 0.0) == 1,
            true
        );
    }

    #[test]
    fn evaluates_not_equal_numeric_comparison() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 3.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::NotEqual, 4.0)],
            0.0,
            -1.0,
        );
        assert_eq!(
            advance_statechart_instance(&mut crate::create_instance(&chart), 0.0) == 1,
            true
        );
    }

    #[test]
    fn reports_blend_progress_without_performing_composition_and_changes_state_at_completion() {
        let chart = create_single_transition_chart(Vec::new(), Vec::new(), 100.0, -1.0);
        let instance = crate::create_instance(&chart);

        assert_eq!(advance_statechart_instance(&instance, 40.0), 0);
        assert_eq!(instance.read().unwrap().region_states[0], 0);
        assert!((get_statechart_region_blend(&instance, 0) - 0.4).abs() < 0.001);
        assert_eq!(advance_statechart_instance(&instance, 60.0), 1);
        assert_eq!(instance.read().unwrap().region_states[0], 1);
        assert_eq!(get_statechart_region_blend(&instance, 0), 0.0);
    }

    #[test]
    fn accumulates_elapsed_time_and_evaluates_exit_time_ratio_against_caller_supplied_duration() {
        let chart = create_single_transition_chart(Vec::new(), Vec::new(), 0.0, 0.5);
        let instance = crate::create_instance(&chart);
        set_statechart_region_duration(&instance, 0, 100.0);

        assert_eq!(advance_statechart_instance(&instance, 49.0), 0);
        assert_eq!(instance.read().unwrap().region_elapsed[0], 49.0);
        assert_eq!(advance_statechart_instance(&instance, 1.0), 1);
        assert_eq!(instance.read().unwrap().region_states[0], 1);
        assert_eq!(instance.read().unwrap().region_elapsed[0], 0.0);
        assert_eq!(instance.read().unwrap().region_duration[0], 0.0);
    }

    #[test]
    fn changes_a_region_at_most_once_per_call_even_when_the_target_has_an_immediate_transition() {
        let chart = Statechart {
            inputs: Vec::new(),
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 0,
                name: None,
                states: vec![
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: vec![transition(1, Vec::new(), 0.0, -1.0)],
                    },
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: vec![transition(2, Vec::new(), 0.0, -1.0)],
                    },
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
        let instance = crate::create_instance(&chart);

        assert_eq!(advance_statechart_instance(&instance, 0.0), 1);
        assert_eq!(instance.read().unwrap().region_states[0], 1);
        assert_eq!(advance_statechart_instance(&instance, 0.0), 1);
        assert_eq!(instance.read().unwrap().region_states[0], 2);
    }

    #[test]
    fn treats_non_positive_and_non_finite_time_as_no_blend_progress() {
        let chart = create_single_transition_chart(Vec::new(), Vec::new(), 100.0, -1.0);
        let instance = crate::create_instance(&chart);

        assert_eq!(advance_statechart_instance(&instance, -1.0), 0);
        assert_eq!(advance_statechart_instance(&instance, f64::NAN), 0);
        assert_eq!(instance.read().unwrap().region_blend[0], 0.0);
    }
}

// ============================================================================
// create_statechart_instance
// ============================================================================

mod create_statechart_instance_tests {
    use super::*;

    #[test]
    fn creates_independent_typed_array_actor_state_while_retaining_the_immutable_chart() {
        let chart = Statechart {
            inputs: vec![
                StatechartInput {
                    initial_value: -2.0,
                    kind: StatechartInputKind::Boolean,
                    name: None,
                },
                StatechartInput {
                    initial_value: 3.5,
                    kind: StatechartInputKind::Number,
                    name: None,
                },
                StatechartInput {
                    initial_value: 0.0,
                    kind: StatechartInputKind::Trigger,
                    name: None,
                },
            ],
            name: Some("shared".to_string()),
            regions: vec![StatechartRegion {
                initial_state_index: 1,
                name: None,
                states: vec![
                    StatechartState {
                        kind: STATECHART_NESTED_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                    StatechartState {
                        kind: "acme.CustomState".to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };

        let chart = std::sync::Arc::new(std::sync::RwLock::new(chart));
        let first = create_statechart_instance(&chart);
        let second = create_statechart_instance(&chart);

        // Both actors retain the very authored chart they were created from.
        assert!(std::sync::Arc::ptr_eq(&first.read().unwrap().chart, &chart));
        assert!(std::sync::Arc::ptr_eq(
            &first.read().unwrap().chart,
            &second.read().unwrap().chart
        ));

        // Input values: Boolean -2 -> 1, Number 3.5, Trigger 0
        assert_eq!(&*first.read().unwrap().input_values, &[1.0, 3.5, 0.0]);

        // Region arrays allocated
        assert_eq!(first.read().unwrap().region_blend.len(), 1);
        assert_eq!(first.read().unwrap().region_duration.len(), 1);
        assert_eq!(first.read().unwrap().region_elapsed.len(), 1);
        assert_eq!(first.read().unwrap().region_states.len(), 1);
        assert_eq!(first.read().unwrap().region_transitions.len(), 1);

        assert_eq!(&*first.read().unwrap().region_states, &[1]);
        assert_eq!(&*first.read().unwrap().region_transitions, &[-1]);
        assert!(first.read().unwrap().duration_guard.is_none());
        assert!(first.read().unwrap().signals.is_none());

        // Independent state
        first.write().unwrap().input_values[1] = 9.0;
        assert_eq!(second.read().unwrap().input_values[1], 3.5);
    }

    #[test]
    fn rejects_malformed_authored_indices_as_programmer_errors() {
        let chart = Statechart {
            inputs: Vec::new(),
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 1,
                name: None,
                states: vec![StatechartState {
                    kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                    name: None,
                    transitions: Vec::new(),
                }],
            }],
        };
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || {
            crate::create_instance(&chart);
        });
    }

    #[test]
    fn accepts_nested_and_vendor_prefixed_state_kinds_without_closed_dispatch() {
        let chart = Statechart {
            inputs: Vec::new(),
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 0,
                name: None,
                states: vec![
                    StatechartState {
                        kind: STATECHART_NESTED_STATE_KIND.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                    StatechartState {
                        kind: "vendor.Special".to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
        // Should not panic
        crate::create_instance(&chart);
    }
}

// ============================================================================
// explain_statechart_transition
// ============================================================================

mod explain_statechart_transition_tests {
    use super::*;

    #[test]
    fn returns_an_invalid_region_diagnostic_for_the_silent_getter_sentinel() {
        let explanation =
            explain_statechart_transition(&crate::create_instance(&create_empty_chart()), 4);
        assert_eq!(
            explanation,
            StatechartTransitionExplanation {
                blend: -1.0,
                condition_index: -1,
                region_index: 4,
                source_state_index: -1,
                status: StatechartTransitionStatus::InvalidRegion,
                target_state_index: -1,
                transition_index: -1,
            }
        );
    }

    #[test]
    fn reports_a_state_with_no_transitions() {
        let explanation =
            explain_statechart_transition(&crate::create_instance(&create_empty_chart()), 0);
        assert_eq!(explanation.status, StatechartTransitionStatus::NoTransitions);
        assert_eq!(explanation.transition_index, -1);
    }

    #[test]
    fn identifies_the_first_unmet_condition() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            vec![condition(0, StatechartComparison::GreaterThan, 2.0)],
            0.0,
            -1.0,
        );
        let explanation =
            explain_statechart_transition(&crate::create_instance(&chart), 0);
        assert_eq!(
            explanation.status,
            StatechartTransitionStatus::ConditionsUnmet
        );
        assert_eq!(explanation.condition_index, 0);
        assert_eq!(explanation.target_state_index, 1);
    }

    #[test]
    fn reports_ready_and_transitioning_states_without_mutation() {
        let chart = create_single_transition_chart(Vec::new(), Vec::new(), 100.0, -1.0);
        let instance = crate::create_instance(&chart);
        assert_eq!(
            explain_statechart_transition(&instance, 0).status,
            StatechartTransitionStatus::Ready
        );
        advance_statechart_instance(&instance, 25.0);
        let explanation = explain_statechart_transition(&instance, 0);
        assert_eq!(
            explanation.status,
            StatechartTransitionStatus::Transitioning
        );
        assert!((explanation.blend - 0.25).abs() < 0.001);
        assert_eq!(explanation.transition_index, 0);
    }

    #[test]
    fn reports_a_satisfied_guard_waiting_on_exit_time() {
        let chart = create_single_transition_chart(Vec::new(), Vec::new(), 0.0, 0.5);
        let instance = crate::create_instance(&chart);
        set_statechart_region_duration(&instance, 0, 100.0);
        let explanation = explain_statechart_transition(&instance, 0);
        assert_eq!(
            explanation.status,
            StatechartTransitionStatus::ExitTimePending
        );
        assert_eq!(explanation.condition_index, -1);
    }

    #[test]
    fn reports_a_missing_duration_that_runtime_coerces_to_no_exit_time_requirement() {
        let chart = create_single_transition_chart(Vec::new(), Vec::new(), 0.0, 0.5);
        let explanation =
            explain_statechart_transition(&crate::create_instance(&chart), 0);
        assert_eq!(
            explanation.status,
            StatechartTransitionStatus::MissingRegionDuration
        );
        assert_eq!(explanation.transition_index, 0);
    }
}

// ============================================================================
// fire_statechart_trigger
// ============================================================================

mod fire_statechart_trigger_tests {
    use super::*;

    #[test]
    fn latches_a_trigger_until_all_regions_see_the_next_advance_and_ignores_condition_value() {
        let instance = crate::create_instance(&create_two_region_trigger_chart());
        fire_statechart_trigger(&instance, 0);
        assert_eq!(instance.read().unwrap().input_values[0], 1.0);
        assert_eq!(advance_statechart_instance(&instance, 0.0), 2);
        assert_eq!(instance.read().unwrap().input_values[0], 0.0);
    }

    #[test]
    fn throws_for_an_invalid_index() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || fire_statechart_trigger(&instance, -1));
    }

    #[test]
    fn throws_for_non_trigger_input() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        expect_throw_kind(flight_entity::FlightErrorKind::TypeError, || {
            fire_statechart_trigger(&instance, 0)
        });
    }
}

// ============================================================================
// get_statechart_input_index
// ============================================================================

mod get_statechart_input_index_tests {
    use super::*;

    #[test]
    fn returns_the_first_matching_input_index_and_negative_one_when_absent() {
        let chart = Statechart {
            inputs: vec![
                StatechartInput {
                    initial_value: 0.0,
                    kind: StatechartInputKind::Number,
                    name: Some("speed".to_string()),
                },
                StatechartInput {
                    initial_value: 1.0,
                    kind: StatechartInputKind::Number,
                    name: Some("speed".to_string()),
                },
            ],
            name: None,
            regions: Vec::new(),
        };
        assert_eq!(get_statechart_input_index(&chart, "speed"), 0);
        assert_eq!(get_statechart_input_index(&chart, "missing"), -1);
    }
}

// ============================================================================
// get_statechart_region_blend
// ============================================================================

mod get_statechart_region_blend_tests {
    use super::*;

    #[test]
    fn returns_a_region_blend_and_negative_one_for_invalid_regions() {
        let instance = crate::create_instance(&create_empty_chart());
        instance.write().unwrap().region_blend[0] = 0.4;
        assert!((get_statechart_region_blend(&instance, 0) - 0.4).abs() < 0.001);
        assert_eq!(get_statechart_region_blend(&instance, -1), -1.0);
        assert_eq!(get_statechart_region_blend(&instance, 1), -1.0);
    }
}

// ============================================================================
// get_statechart_region_state
// ============================================================================

mod get_statechart_region_state_tests {
    use super::*;

    #[test]
    fn returns_a_region_state_and_negative_one_for_invalid_regions() {
        let instance = crate::create_instance(&create_empty_chart());
        assert_eq!(get_statechart_region_state(&instance, 0), 0);
        assert_eq!(get_statechart_region_state(&instance, -1), -1);
        assert_eq!(get_statechart_region_state(&instance, 1), -1);
    }
}

// ============================================================================
// initialize_statechart_instance
// ============================================================================

mod initialize_statechart_instance_tests {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_statechart_instance() {
        // Verify the function exists and is callable
        let chart = std::sync::Arc::new(std::sync::RwLock::new(create_empty_chart()));
        let mut out = StatechartInstance::default();
        flight_statechart::contract::initialize_statechart_instance(&mut out, &chart);
        assert_eq!(*out.chart.read().unwrap(), *chart.read().unwrap());
    }
}

// ============================================================================
// set_statechart_boolean_input
// ============================================================================

mod set_statechart_boolean_input_tests {
    use super::*;

    #[test]
    fn writes_the_boolean_input_vocabulary_as_numeric_0_1() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Boolean,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        set_statechart_boolean_input(&instance, 0, true);
        assert_eq!(instance.read().unwrap().input_values[0], 1.0);
        set_statechart_boolean_input(&instance, 0, false);
        assert_eq!(instance.read().unwrap().input_values[0], 0.0);
    }

    #[test]
    fn throws_for_an_invalid_index() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || set_statechart_boolean_input(&instance, 1, true));
    }

    #[test]
    fn throws_for_non_boolean_input() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        expect_throw_kind(flight_entity::FlightErrorKind::TypeError, || set_statechart_boolean_input(&instance, 0, true));
    }
}

// ============================================================================
// set_statechart_number_input
// ============================================================================

mod set_statechart_number_input_tests {
    use super::*;

    #[test]
    fn writes_an_exact_numeric_value() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Number,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        set_statechart_number_input(&instance, 0, -3.25);
        assert_eq!(instance.read().unwrap().input_values[0], -3.25);
    }

    #[test]
    fn throws_for_an_invalid_index() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Boolean,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || set_statechart_number_input(&instance, 1, 2.0));
    }

    #[test]
    fn throws_for_non_number_input() {
        let chart = create_single_transition_chart(
            vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Boolean,
                name: None,
            }],
            Vec::new(),
            0.0,
            -1.0,
        );
        let instance = crate::create_instance(&chart);
        expect_throw_kind(flight_entity::FlightErrorKind::TypeError, || set_statechart_number_input(&instance, 0, 2.0));
    }
}

// ============================================================================
// set_statechart_region_duration
// ============================================================================

mod set_statechart_region_duration_tests {
    use super::*;

    #[test]
    fn sets_the_plain_per_region_exit_time_denominator() {
        let instance = crate::create_instance(&create_empty_chart());
        set_statechart_region_duration(&instance, 0, 250.0);
        assert_eq!(instance.read().unwrap().region_duration[0], 250.0);
    }

    #[test]
    fn accepts_zero_as_an_explicit_unavailable_duration() {
        let instance = crate::create_instance(&create_empty_chart());
        set_statechart_region_duration(&instance, 0, 0.0);
        assert_eq!(instance.read().unwrap().region_duration[0], 0.0);
    }

    #[test]
    fn throws_for_an_invalid_region() {
        let instance = crate::create_instance(&create_empty_chart());
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || set_statechart_region_duration(&instance, 1, 1.0));
    }

    #[test]
    fn throws_for_negative_duration() {
        let instance = crate::create_instance(&create_empty_chart());
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || set_statechart_region_duration(&instance, 0, -1.0));
    }

    #[test]
    fn throws_for_nan_duration() {
        let instance = crate::create_instance(&create_empty_chart());
        expect_throw_kind(flight_entity::FlightErrorKind::RangeError, || set_statechart_region_duration(&instance, 0, f64::NAN));
    }
}
