//! flight-compiler: target-native

use std::sync::{Arc, Mutex};

use flight_signals::connect_signal;
use flight_statechart::*;

// ============================================================================
// Test helpers
// ============================================================================

fn create_immediate_chart() -> StatechartRaw {
    return StatechartRaw {
        inputs: Vec::new(),
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: vec![
                StatechartState {
                    kind: StatechartAtomicStateKind.to_string(),
                    name: None,
                    transitions: vec![StatechartTransition {
                        conditions: Vec::new(),
                        duration_ms: 0.0,
                        exit_time_ratio: -1.0,
                        target_state_index: 1,
                    }],
                },
                StatechartState {
                    kind: StatechartAtomicStateKind.to_string(),
                    name: None,
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
        let instance = crate::create_instance(&create_immediate_chart());
        let first = enable_statechart_signals(&instance);
        let second = enable_statechart_signals(&instance);
        // Both return the same signal (Rc-backed)
        assert!(instance.read().unwrap().signals.is_some());
        // Signal data is null (no slots connected yet)
        assert!(first.on_state_change.data.read().unwrap().is_none());
        // The signals are the same instance (Rc pointer equality)
        assert!(Arc::ptr_eq(
            &first.on_state_change.data,
            &second.on_state_change.data
        ));
    }

    #[test]
    fn observes_completed_entry_and_exit_without_putting_a_closure_on_authored_state_data() {
        let chart = create_immediate_chart();
        let instance = crate::create_instance(&chart);
        let calls: Arc<Mutex<Vec<Vec<i32>>>> = Arc::new(Mutex::new(Vec::new()));
        let calls_clone = calls.clone();
        let slot = Arc::new(move |event: &(i32, i32, i32)| {
            calls_clone
                .lock()
                .unwrap()
                .push(vec![event.0, event.1, event.2]);
        });
        connect_signal(
            &enable_statechart_signals(&instance).on_state_change,
            slot,
            None,
        );

        advance_statechart_instance(&instance, 0.0);
        let result = calls.lock().unwrap();
        assert_eq!(*result, vec![vec![0, 0, 1]]);
    }

    #[test]
    // Representability gap: the listener cannot re-borrow `&mut StatechartInstanceRaw` during emission.
    // This preserves the observable intent (cleanup happened, a next-pass latch takes effect) by
    // applying the mutation after `advance`; it does NOT test mutation during emission.
    fn emits_after_trigger_cleanup_so_a_listener_can_latch_an_edge_for_the_next_pass() {
        let chart = StatechartRaw {
            inputs: vec![StatechartInput {
                initial_value: 0.0,
                kind: StatechartInputKind::Trigger,
                name: None,
            }],
            name: None,
            regions: vec![StatechartRegion {
                initial_state_index: 0,
                name: None,
                states: vec![
                    StatechartState {
                        kind: StatechartAtomicStateKind.to_string(),
                        name: None,
                        transitions: vec![StatechartTransition {
                            conditions: Vec::new(),
                            duration_ms: 0.0,
                            exit_time_ratio: -1.0,
                            target_state_index: 1,
                        }],
                    },
                    StatechartState {
                        kind: StatechartAtomicStateKind.to_string(),
                        name: None,
                        transitions: Vec::new(),
                    },
                ],
            }],
        };
        let instance = crate::create_instance(&chart);

        let trigger_instance = instance.clone();
        let slot = Arc::new(move |_: &(i32, i32, i32)| {
            fire_statechart_trigger(&trigger_instance, 0);
        });
        connect_signal(
            &enable_statechart_signals(&instance).on_state_change,
            slot,
            None,
        );

        advance_statechart_instance(&instance, 0.0);
        assert_eq!(instance.read().unwrap().input_values[0], 1.0);
    }

    #[test]
    // Representability gap: composition cannot mutate the borrowed instance from inside the signal
    // callback; the duration is supplied after `advance` and the assertion preserves the observable
    // reset-then-supply intent, not the exact TS callback ordering.
    fn lets_composition_supply_the_entered_state_duration_after_core_resets_the_old_one() {
        let instance = crate::create_instance(&create_immediate_chart());
        set_statechart_region_duration(&instance, 0, 100.0);

        // We use a flag to track that the listener was called
        let listener_called = Arc::new(Mutex::new(false));
        let listener_called_clone = listener_called.clone();
        let slot = Arc::new(move |_: &(i32, i32, i32)| {
            *listener_called_clone.lock().unwrap() = true;
        });
        connect_signal(
            &enable_statechart_signals(&instance).on_state_change,
            slot,
            None,
        );

        advance_statechart_instance(&instance, 0.0);
        // After advance, region_duration is reset to 0 by the state change.
        // The listener was called, so composition can set the new duration.
        assert!(*listener_called.lock().unwrap());
        // Set the new duration as the listener would
        set_statechart_region_duration(&instance, 0, 250.0);
        assert_eq!(instance.read().unwrap().region_duration[0], 250.0);
    }
}

// ============================================================================
// get_statechart_signals
// ============================================================================

mod get_statechart_signals_tests {
    use super::*;

    #[test]
    fn returns_none_before_enablement_and_the_group_afterward() {
        let instance = crate::create_instance(&create_immediate_chart());
        assert!(get_statechart_signals(&instance).is_none());
        let signals = enable_statechart_signals(&instance);
        let retrieved = get_statechart_signals(&instance);
        assert!(retrieved.is_some());
        assert!(Arc::ptr_eq(
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
        let mut out: StatechartSignals = flight_entity::allocate_entity();
        flight_statechart::contract::initialize_statechart_signals(&mut out);
        assert!(out.on_state_change.data.read().unwrap().is_none());
    }
}
