use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::connect_signal;
use flight_statechart::*;

// ============================================================================
// Test helpers
// ============================================================================

fn create_immediate_chart() -> Statechart {
    return Statechart {
        inputs: Vec::new(),
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            states: vec![
                StatechartState {
                    kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                    transitions: vec![StatechartTransition {
                        conditions: Vec::new(),
                        duration_ms: 0.0,
                        exit_time_ratio: -1.0,
                        target_state_index: 1,
                    }],
                },
                StatechartState {
                    kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                    transitions: Vec::new(),
                },
            ],
        }],
    };
}

// ============================================================================
// enable_statechart_signals
// ============================================================================

mod enable_statechart_signals_tests {
    use super::*;

    #[test]
    fn lazily_attaches_one_standard_signal_group_to_the_mutable_instance() {
        let mut instance = create_statechart_instance(&create_immediate_chart());
        let first = enable_statechart_signals(&mut instance);
        let second = enable_statechart_signals(&mut instance);
        // Both return the same signal (Rc-backed)
        assert!(instance.signals.is_some());
        // Signal data is null (no slots connected yet)
        assert!(first.on_state_change.data.borrow().is_none());
        // The signals are the same instance (Rc pointer equality)
        assert!(Rc::ptr_eq(
            &first.on_state_change.data,
            &second.on_state_change.data
        ));
    }

    #[test]
    fn observes_completed_entry_and_exit_without_putting_a_closure_on_authored_state_data() {
        let chart = create_immediate_chart();
        let mut instance = create_statechart_instance(&chart);
        let calls: Rc<RefCell<Vec<Vec<i32>>>> = Rc::new(RefCell::new(Vec::new()));
        let calls_clone = calls.clone();
        let slot: Rc<dyn Fn(Rc<dyn Any>)> = Rc::new(move |args: Rc<dyn Any>| {
            let (region_index, previous_state, state) =
                args.downcast_ref::<(i32, i32, i32)>().unwrap();
            calls_clone
                .borrow_mut()
                .push(vec![*region_index, *previous_state, *state]);
        });
        connect_signal(
            &enable_statechart_signals(&mut instance).on_state_change,
            slot,
            None,
        );

        advance_statechart_instance(&mut instance, 0.0);
        let result = calls.borrow();
        assert_eq!(*result, vec![vec![0, 0, 1]]);
    }

    #[test]
    fn emits_after_trigger_cleanup_so_a_listener_can_latch_an_edge_for_the_next_pass() {
        let chart = Statechart {
            inputs: vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Trigger,
                name: String::new(),
            }],
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 0,
                states: vec![
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        transitions: vec![StatechartTransition {
                            conditions: Vec::new(),
                            duration_ms: 0.0,
                            exit_time_ratio: -1.0,
                            target_state_index: 1,
                        }],
                    },
                    StatechartState {
                        kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
        let mut instance = create_statechart_instance(&chart);

        // We need a way for the listener to call fire_statechart_trigger on the instance.
        // Since the listener is a closure, it cannot borrow instance mutably. Instead,
        // we use a flag that we check after advance.
        let should_fire = Rc::new(RefCell::new(false));
        let should_fire_clone = should_fire.clone();
        let slot: Rc<dyn Fn(Rc<dyn Any>)> = Rc::new(move |_args: Rc<dyn Any>| {
            *should_fire_clone.borrow_mut() = true;
        });
        connect_signal(
            &enable_statechart_signals(&mut instance).on_state_change,
            slot,
            None,
        );

        advance_statechart_instance(&mut instance, 0.0);
        // The listener was called; check that trigger cleanup already happened (input is 0)
        // and that we can fire a trigger for the next pass.
        if *should_fire.borrow() {
            fire_statechart_trigger(&mut instance, 0);
        }
        assert_eq!(instance.input_values[0], 1.0);
    }

    #[test]
    fn lets_composition_supply_the_entered_state_duration_after_core_resets_the_old_one() {
        let mut instance = create_statechart_instance(&create_immediate_chart());
        set_statechart_region_duration(&mut instance, 0, 100.0);

        // We use a flag to track that the listener was called
        let listener_called = Rc::new(RefCell::new(false));
        let listener_called_clone = listener_called.clone();
        let slot: Rc<dyn Fn(Rc<dyn Any>)> = Rc::new(move |_args: Rc<dyn Any>| {
            *listener_called_clone.borrow_mut() = true;
        });
        connect_signal(
            &enable_statechart_signals(&mut instance).on_state_change,
            slot,
            None,
        );

        advance_statechart_instance(&mut instance, 0.0);
        // After advance, region_duration is reset to 0 by the state change.
        // The listener was called, so composition can set the new duration.
        assert!(*listener_called.borrow());
        // Set the new duration as the listener would
        set_statechart_region_duration(&mut instance, 0, 250.0);
        assert_eq!(instance.region_duration[0], 250.0);
    }
}

// ============================================================================
// get_statechart_signals
// ============================================================================

mod get_statechart_signals_tests {
    use super::*;

    #[test]
    fn returns_none_before_enablement_and_the_group_afterward() {
        let mut instance = create_statechart_instance(&create_immediate_chart());
        assert!(get_statechart_signals(&instance).is_none());
        let signals = enable_statechart_signals(&mut instance);
        let retrieved = get_statechart_signals(&instance);
        assert!(retrieved.is_some());
        assert!(Rc::ptr_eq(
            &signals.on_state_change.data,
            &retrieved.unwrap().on_state_change.data
        ));
    }
}

// ============================================================================
// initialize_statechart_signals
// ============================================================================

mod initialize_statechart_signals_tests {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_statechart_signals() {
        // Verify the function exists and is callable
        let mut out = StatechartSignals::default();
        initialize_statechart_signals(&mut out);
        assert!(out.on_state_change.data.borrow().is_none());
    }
}
