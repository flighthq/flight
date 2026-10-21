use std::sync::{Arc, RwLock};

use flight_log::{
    add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
    remove_log_sink, LogData, LogLevel, LogStateRef, LogValue,
};
use flight_statechart::*;

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn create_exit_time_chart() -> Statechart {
    return Statechart {
        inputs: Vec::new(),
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: vec![
                StatechartState {
                    kind: STATECHART_ATOMIC_STATE_KIND.to_string(),
                    name: None,
                    transitions: vec![StatechartTransition {
                        conditions: Vec::new(),
                        duration_ms: 0.0,
                        exit_time_ratio: 0.5,
                        target_state_index: 1,
                    }],
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

fn capture_guard_log<F: FnOnce()>(state: &LogStateRef, run: F) -> Vec<flight_log::LogEntry> {
    let memory = create_memory_log_sink(8);
    add_log_sink(state, memory.sink.clone());
    run();
    remove_log_sink(state, &memory.sink);
    return get_memory_log_sink_entries(&memory);
}

mod are_statechart_guards_enabled {
    use super::*;

    #[test]
    fn reports_guard_state_per_actor_and_preserves_custom_guard_distinction() {
        let guarded = crate::create_instance(&create_exit_time_chart());
        let unguarded = crate::create_instance(&create_exit_time_chart());
        let guard_state = crate::guard_state();
        let state = crate::log_state();
        enable_statechart_guards(&guarded, &guard_state, &state, Arc::new(|| 0.0));
        assert!(are_statechart_guards_enabled(&guarded));
        assert!(!are_statechart_guards_enabled(&unguarded));

        let custom: StatechartDurationGuard = Arc::new(|_: &flight_entity::Ref<StatechartInstance>, _: &StatechartTransitionExplanation| {});
        guarded.write().unwrap().duration_guard = Some(custom);
        assert!(!are_statechart_guards_enabled(&guarded));
    }
}

mod disable_statechart_guards {
    use super::*;

    #[test]
    fn restores_silent_coercion_without_changing_transition_behavior() {
        let instance = crate::create_instance(&create_exit_time_chart());
        let guard_state = crate::guard_state();
        enable_statechart_guards(&instance, &guard_state, &crate::log_state(), Arc::new(|| 0.0));
        disable_statechart_guards(&instance);
        let state = log_state();
        let entries = capture_guard_log(&state, || {
            assert_eq!(advance_statechart_instance(&instance, 0.0), 1);
        });
        assert!(entries.is_empty());
    }
}

mod enable_statechart_guards {
    use super::*;

    #[test]
    fn warns_once_and_names_the_duration_setter_while_preserving_no_requirement_coercion() {
        let instance = crate::create_instance(&create_exit_time_chart());
        let state = log_state();
        enable_statechart_guards(&instance, &crate::guard_state(), &state, Arc::new(|| 0.0));
        let entries = capture_guard_log(&state, || {
            assert_eq!(advance_statechart_instance(&instance, 0.0), 1);
            assert_eq!(advance_statechart_instance(&instance, 0.0), 0);
        });
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("statechart".to_string()));
        match &entries[0].data {
            LogData::Record(record) => {
                match record.get("exitTimeRatio") {
                    Some(LogValue::Float(value)) => assert_eq!(*value, 0.5),
                    _ => panic!("expected exitTimeRatio"),
                }
                match record.get("regionDuration") {
                    Some(LogValue::Float(value)) => assert_eq!(*value, 0.0),
                    _ => panic!("expected regionDuration"),
                }
                match record.get("regionIndex") {
                    Some(LogValue::Int(value)) => assert_eq!(*value, 0),
                    _ => panic!("expected regionIndex"),
                }
                match record.get("transitionIndex") {
                    Some(LogValue::Int(value)) => assert_eq!(*value, 0),
                    _ => panic!("expected transitionIndex"),
                }
                match record.get("status") {
                    Some(LogValue::Str(value)) => assert_eq!(value, "MissingRegionDuration"),
                    _ => panic!("expected status"),
                }
                match record.get("message") {
                    Some(LogValue::Str(value)) => assert!(value.contains("setStatechartRegionDuration")),
                    _ => panic!("expected message"),
                }
            }
            _ => panic!("expected a data record"),
        }
    }

    #[test]
    fn stays_silent_when_a_positive_duration_makes_the_exit_time_ratio_well_defined() {
        let instance = crate::create_instance(&create_exit_time_chart());
        let guard_state = crate::guard_state();
        enable_statechart_guards(&instance, &guard_state, &crate::log_state(), Arc::new(|| 0.0));
        set_statechart_region_duration(&instance, 0, 100.0);
        let state = log_state();
        let entries = capture_guard_log(&state, || {
            assert_eq!(advance_statechart_instance(&instance, 49.0), 0);
            assert_eq!(advance_statechart_instance(&instance, 1.0), 1);
        });
        assert!(entries.is_empty());
    }

    #[test]
    fn keeps_the_production_default_coercion_silent_when_guards_were_never_enabled() {
        let instance = crate::create_instance(&create_exit_time_chart());
        let state = log_state();
        let entries = capture_guard_log(&state, || {
            assert_eq!(advance_statechart_instance(&instance, 0.0), 1);
        });
        assert!(entries.is_empty());
    }
}
