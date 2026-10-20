use flight_statechart::*;

// ============================================================================
// Test helpers
// ============================================================================

fn capture_log<F: FnOnce()>(run: F) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(sink.sink.clone());
    run();
    let entries = get_memory_log_sink_entries(&sink);
    remove_log_sink(&sink.sink);
    return entries;
}

fn create_exit_time_chart() -> Statechart {
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
                        exit_time_ratio: 0.5,
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

fn find_log_data_f64(entry: &LogEntry, key: &str) -> Option<f64> {
    if let LogData::Record(ref fields) = entry.data {
        for (k, v) in fields {
            if k == key {
                if let LogDataValue::F64(val) = v {
                    return Some(*val);
                }
            }
        }
    }
    return None;
}

fn find_log_data_i32(entry: &LogEntry, key: &str) -> Option<i32> {
    if let LogData::Record(ref fields) = entry.data {
        for (k, v) in fields {
            if k == key {
                if let LogDataValue::I32(val) = v {
                    return Some(*val);
                }
            }
        }
    }
    return None;
}

fn find_log_data_string(entry: &LogEntry, key: &str) -> Option<String> {
    if let LogData::Record(ref fields) = entry.data {
        for (k, v) in fields {
            if k == key {
                if let LogDataValue::String(val) = v {
                    return Some(val.clone());
                }
            }
        }
    }
    return None;
}

fn find_log_data_status(entry: &LogEntry, key: &str) -> Option<StatechartTransitionStatus> {
    if let LogData::Record(ref fields) = entry.data {
        for (k, v) in fields {
            if k == key {
                if let LogDataValue::Status(val) = v {
                    return Some(*val);
                }
            }
        }
    }
    return None;
}

// ============================================================================
// are_statechart_guards_enabled
// ============================================================================

mod are_statechart_guards_enabled_tests {
    use super::*;

    #[test]
    fn reports_guard_state_per_actor() {
        let mut guarded = create_statechart_instance(&create_exit_time_chart());
        let unguarded = create_statechart_instance(&create_exit_time_chart());
        enable_statechart_guards(&mut guarded);
        assert_eq!(are_statechart_guards_enabled(&guarded), true);
        assert_eq!(are_statechart_guards_enabled(&unguarded), false);
    }
}

// ============================================================================
// disable_statechart_guards
// ============================================================================

mod disable_statechart_guards_tests {
    use super::*;

    #[test]
    fn restores_silent_coercion_without_changing_transition_behavior() {
        let mut instance = create_statechart_instance(&create_exit_time_chart());
        enable_statechart_guards(&mut instance);
        disable_statechart_guards(&mut instance);
        let entries = capture_log(|| {
            assert_eq!(advance_statechart_instance(&mut instance, 0.0), 1);
        });
        assert!(entries.is_empty());
    }
}

// ============================================================================
// enable_statechart_guards
// ============================================================================

mod enable_statechart_guards_tests {
    use super::*;

    #[test]
    fn warns_once_and_names_the_duration_setter_while_preserving_no_requirement_coercion() {
        let mut instance = create_statechart_instance(&create_exit_time_chart());
        enable_statechart_guards(&mut instance);
        let entries = capture_log(|| {
            assert_eq!(advance_statechart_instance(&mut instance, 0.0), 1);
        });
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel, Some("statechart".to_string()));
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(find_log_data_f64(&entries[0], "exitTimeRatio"), Some(0.5));
        assert_eq!(find_log_data_f64(&entries[0], "regionDuration"), Some(0.0));
        assert_eq!(find_log_data_i32(&entries[0], "regionIndex"), Some(0));
        assert_eq!(
            find_log_data_status(&entries[0], "status"),
            Some(StatechartTransitionStatus::MissingRegionDuration)
        );
        assert_eq!(find_log_data_i32(&entries[0], "transitionIndex"), Some(0));
        let message = find_log_data_string(&entries[0], "message").unwrap();
        assert!(message.contains("setStatechartRegionDuration"));
    }

    #[test]
    fn stays_silent_when_a_positive_duration_makes_the_exit_time_ratio_well_defined() {
        let mut instance = create_statechart_instance(&create_exit_time_chart());
        enable_statechart_guards(&mut instance);
        set_statechart_region_duration(&mut instance, 0, 100.0);
        let entries = capture_log(|| {
            assert_eq!(advance_statechart_instance(&mut instance, 49.0), 0);
            assert_eq!(advance_statechart_instance(&mut instance, 1.0), 1);
        });
        assert!(entries.is_empty());
    }

    #[test]
    fn keeps_the_production_default_coercion_silent_when_guards_were_never_enabled() {
        let mut instance = create_statechart_instance(&create_exit_time_chart());
        let entries = capture_log(|| {
            assert_eq!(advance_statechart_instance(&mut instance, 0.0), 1);
        });
        assert!(entries.is_empty());
    }
}
